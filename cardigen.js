(() => {
  "use strict";

  const config = window.CARDIGEN_CONFIG;
  if (!config || !Array.isArray(config.sideDefaults) || config.sideDefaults.length !== 2) {
    throw new Error("Cardigen requires two configured card sides.");
  }

  const editors = [
    document.getElementById("side-1"),
    document.getElementById("side-2"),
  ];
  const warnings = [
    document.getElementById("side-1-warning"),
    document.getElementById("side-2-warning"),
  ];
  const secondColumn = document.getElementById("side-2-column");
  const doubleSided = document.getElementById("double-sided");
  const printButton = document.getElementById("print-button");
  const printRoot = document.getElementById("print-root");
  const toolbarButtons = [...document.querySelectorAll(".format-button")];
  const restoreButtons = [...document.querySelectorAll(".restore-button")];

  let activeEditor = editors[0];
  let savedRange = null;
  let overflowFrame = null;

  document.title =
    config.documentTitle || `${config.pageTitle || "Cardigen"} — Cardigen`;
  document.getElementById("page-title").textContent =
    config.pageTitle || "Cardigen";

  editors.forEach((editor, index) => {
    editor.innerHTML = config.sideDefaults[index].trim();
    editor.addEventListener("focus", () => {
      activeEditor = editor;
      rememberSelection();
      updateToolbarState();
    });
    editor.addEventListener("input", scheduleOverflowCheck);
    editor.addEventListener("keyup", () => {
      rememberSelection();
      updateToolbarState();
    });
    editor.addEventListener("mouseup", () => {
      rememberSelection();
      updateToolbarState();
    });
    editor.addEventListener("paste", pastePlainText);
    editor.addEventListener("drop", preventFormattedDrop);
  });

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const candidate = editors.find((editor) =>
      editor.contains(selection.anchorNode),
    );
    if (!candidate || candidate.contentEditable !== "true") return;

    activeEditor = candidate;
    savedRange = selection.getRangeAt(0).cloneRange();
    updateToolbarState();
  });

  toolbarButtons.forEach((button) => {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("pointerdown", (event) => {
      captureCurrentSelection();
      event.preventDefault();
    });
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      applyCommand(button.dataset.command);
    });
  });

  restoreButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const sideIndex = Number(button.dataset.side) - 1;
      const confirmed = window.confirm(
        "Restore this card’s default text? Your changes to this card will be lost.",
      );
      if (!confirmed) return;

      editors[sideIndex].innerHTML = config.sideDefaults[sideIndex].trim();
      activeEditor = editors[sideIndex];
      savedRange = null;
      scheduleOverflowCheck();
      editors[sideIndex].focus();
    });
  });

  doubleSided.addEventListener("change", updateSecondSideState);
  printButton.addEventListener("click", requestPrint);
  window.addEventListener("beforeprint", buildPrintPages);
  window.addEventListener("resize", scheduleOverflowCheck);

  updateSecondSideState();
  scheduleOverflowCheck();

  function rememberSelection() {
    const selection = window.getSelection();
    if (
      !selection ||
      selection.rangeCount === 0 ||
      !activeEditor.contains(selection.anchorNode)
    ) {
      return;
    }
    savedRange = selection.getRangeAt(0).cloneRange();
  }

  function captureCurrentSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const candidate = editors.find((editor) =>
      editor.contains(selection.anchorNode),
    );
    if (!candidate || candidate.contentEditable !== "true") return;

    activeEditor = candidate;
    savedRange = selection.getRangeAt(0).cloneRange();
  }

  function restoreSelection() {
    activeEditor.focus();
    if (!savedRange || !activeEditor.contains(savedRange.commonAncestorContainer)) {
      return;
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  function applyCommand(command) {
    if (!command) return;

    captureCurrentSelection();
    if (activeEditor.contentEditable !== "true") return;
    restoreSelection();
    document.execCommand(command, false);
    rememberSelection();
    updateToolbarState();
    scheduleOverflowCheck();
  }

  function updateToolbarState() {
    toolbarButtons.forEach((button) => {
      const command = button.dataset.command;
      let isActive = false;
      try {
        isActive = document.queryCommandState(command);
      } catch {
        isActive = false;
      }
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function pastePlainText(event) {
    event.preventDefault();
    const text = event.clipboardData
      .getData("text/plain")
      .replace(/\r\n?/g, "\n");
    document.execCommand("insertText", false, text);
  }

  function preventFormattedDrop(event) {
    event.preventDefault();
  }

  function updateSecondSideState() {
    const enabled = doubleSided.checked;
    secondColumn.classList.toggle("is-disabled", !enabled);
    editors[1].contentEditable = String(enabled);
    editors[1].setAttribute("aria-disabled", String(!enabled));
    restoreButtons[1].disabled = !enabled;

    if (!enabled && activeEditor === editors[1]) {
      activeEditor = editors[0];
      savedRange = null;
      editors[0].focus();
    }

    scheduleOverflowCheck();
  }

  function hasOverflow(editor) {
    return (
      editor.scrollHeight > editor.clientHeight + 1 ||
      editor.scrollWidth > editor.clientWidth + 1
    );
  }

  function scheduleOverflowCheck() {
    if (overflowFrame) cancelAnimationFrame(overflowFrame);
    overflowFrame = requestAnimationFrame(() => {
      overflowFrame = null;
      editors.forEach((editor, index) => {
        const relevant = index === 0 || doubleSided.checked;
        warnings[index].hidden = !(relevant && hasOverflow(editor));
      });
    });
  }

  function requestPrint() {
    const overflowingSides = editors
      .map((editor, index) => ({ editor, index }))
      .filter(({ editor, index }) => {
        const relevant = index === 0 || doubleSided.checked;
        return relevant && hasOverflow(editor);
      });

    if (overflowingSides.length > 0) {
      const confirmed = window.confirm(
        "At least one card has too much text. Extra text will be clipped when printed. Print anyway?",
      );
      if (!confirmed) return;
    }

    buildPrintPages();
    window.print();
  }

  function buildPrintPages() {
    printRoot.replaceChildren();
    const sidesToPrint = doubleSided.checked ? editors : [editors[0]];

    sidesToPrint.forEach((editor) => {
      const page = document.createElement("section");
      page.className = "print-page";

      for (let index = 0; index < 8; index += 1) {
        const card = document.createElement("div");
        card.className = "print-card";

        const content = document.createElement("div");
        content.className = "print-content";
        content.innerHTML = editor.innerHTML;

        card.append(content);
        page.append(card);
      }

      printRoot.append(page);
    });
  }
})();

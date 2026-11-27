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

  const MIN_FONT_SIZE = 0.8;
  const MAX_FONT_SIZE = 1.8;
  const TYPEFACES = [
    ["Helvetica", "Helvetica, Arial, sans-serif"],
    ["Georgia", "Georgia, serif"],
    ["Times New Roman", '"Times New Roman", Times, serif'],
    ["Verdana", "Verdana, sans-serif"],
    ["Courier New", '"Courier New", Courier, monospace'],
    ["Andale Mono", '"Andale Mono", "Courier New", monospace'],
  ];

  let activeEditor = editors[0];
  let savedRange = null;
  let overflowFrame = null;
  let typefaceIndex = 0;
  const fontButton = document.getElementById("font-button");

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
    if (!button.dataset.size) button.setAttribute("aria-pressed", "false");
    button.addEventListener("pointerdown", (event) => {
      captureCurrentSelection();
      event.preventDefault();
    });
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (button.dataset.size) {
        changeFontSize(Number(button.dataset.size));
        return;
      }
      applyCommand(button.dataset.command);
    });
  });

  fontButton.addEventListener("click", () => {
    typefaceIndex = (typefaceIndex + 1) % TYPEFACES.length;
    applyTypeface(typefaceIndex);
    scheduleOverflowCheck();
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
  updateFontSizeButtons();
  applyTypeface(0);

  function applyTypeface(index) {
    const [name, family] = TYPEFACES[index];
    fontButton.textContent = name;
    fontButton.style.fontFamily = family;
    fontButton.setAttribute("aria-label", `Font: ${name}`);
    editors.forEach((editor) => editor.style.setProperty("--font", family));
  }

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
      if (button.dataset.size) return;
      const command = button.dataset.command;
      let isActive = false;
      try {
        isActive = document.queryCommandState(command);
      } catch {
        isActive = false;
      }
      button.setAttribute("aria-pressed", String(isActive));
    });
    updateFontSizeButtons();
  }

  function elementFontSize(element) {
    let current = element;
    while (current && !editors.includes(current)) {
      const raw = current.style && current.style.getPropertyValue("--size");
      if (raw) return Math.round(parseFloat(raw) * 10) / 10;
      current = current.parentElement;
    }
    return 1;
  }

  function selectionFontSizes() {
    if (
      !savedRange ||
      !activeEditor.contains(savedRange.commonAncestorContainer)
    ) {
      return [1];
    }

    if (savedRange.collapsed) {
      const container = savedRange.startContainer;
      const element =
        container.nodeType === Node.ELEMENT_NODE
          ? container
          : container.parentElement;
      return [elementFontSize(element)];
    }

    const root =
      savedRange.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? savedRange.commonAncestorContainer
        : savedRange.commonAncestorContainer.parentElement;
    const sizes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent.replace(/\u200B/g, "");
      if (!text || !savedRange.intersectsNode(walker.currentNode)) continue;
      sizes.push(elementFontSize(walker.currentNode.parentElement));
    }
    return sizes.length ? sizes : [1];
  }

  function updateFontSizeButtons() {
    const sizes = selectionFontSizes();
    toolbarButtons.forEach((button) => {
      if (!button.dataset.size) return;
      const delta = Number(button.dataset.size);
      const blocked = sizes.every((size) => {
        const next = Math.round((size + delta) * 10) / 10;
        return next < MIN_FONT_SIZE || next > MAX_FONT_SIZE;
      });
      button.disabled = blocked;
    });
  }

  function changeFontSize(delta) {
    captureCurrentSelection();
    if (activeEditor.contentEditable !== "true") return;
    restoreSelection();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    if (range.collapsed) {
      const container = range.startContainer;
      const element =
        container.nodeType === Node.ELEMENT_NODE
          ? container
          : container.parentElement;
      const current = elementFontSize(element);
      const next = clampedFontSize(current + delta);
      if (next === current) return;
      const span = document.createElement("span");
      span.style.setProperty("--size", next.toFixed(1));
      const marker = document.createTextNode("\u200B");
      span.appendChild(marker);
      range.insertNode(span);
      const caret = document.createRange();
      caret.setStart(marker, marker.length);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      savedRange = caret.cloneRange();
    } else {
      const root =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;
      const nodes = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (range.intersectsNode(walker.currentNode)) nodes.push(walker.currentNode);
      }
      nodes.forEach((node) => {
        if (!node.textContent.replace(/\u200B/g, "")) return;
        let target = node;
        if (range.startContainer === target && range.startOffset > 0) {
          target = target.splitText(range.startOffset);
        }
        if (range.endContainer === target && range.endOffset < target.length) {
          target.splitText(range.endOffset);
        }
        const current = elementFontSize(target.parentElement);
        const next = clampedFontSize(current + delta);
        if (next !== current) setTextFontSize(target, next);
      });
      rememberSelection();
    }

    updateToolbarState();
    scheduleOverflowCheck();
  }

  function clampedFontSize(value) {
    const rounded = Math.round(value * 10) / 10;
    return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, rounded));
  }

  function setTextFontSize(textNode, size) {
    const parent = textNode.parentElement;
    if (
      parent &&
      !editors.includes(parent) &&
      parent.style.getPropertyValue("--size") &&
      parent.childNodes.length === 1
    ) {
      parent.style.setProperty("--size", size.toFixed(1));
      return;
    }

    const span = document.createElement("span");
    span.style.setProperty("--size", size.toFixed(1));
    textNode.replaceWith(span);
    span.appendChild(textNode);
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
        card.style.setProperty("--font", TYPEFACES[typefaceIndex][1]);

        const content = document.createElement("div");
        content.className = "print-content";
        content.innerHTML = editor.innerHTML.replace(/\u200B/g, "");

        card.append(content);
        page.append(card);
      }

      printRoot.append(page);
    });
  }
})();

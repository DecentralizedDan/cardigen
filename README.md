# Cardigen

Cardigen is a lightweight, privacy-first tool for making copies of cards that
can be printed, cut out, and laminated. Everything runs locally in the browser:
there are no accounts, uploads, analytics, or external dependencies.

Version 1 provides:

- Two editable card sides with simple bold, italic, underline, and paragraph-alignment controls
- Eight identical 2.25 × 3.7-inch cards on each landscape Letter page
- Optional double-sided output
- One-point cutting borders and overflow warnings
- Browser printing, including the option to save the output as a PDF
- Configurable default text and organization branding

The included example is a generic emergency-contact card. It shows how a site
can supply editable default text without sending what users type anywhere.
Replace `cardigen-config.js` to use Cardigen for another kind of card. Set
`documentTitle` there when the browser-tab title should differ from the visible
page title.

Open `index.html` from a local web server in Chrome or Edge.

Cardigen is available under the MIT License.

**Caveat:** The initial code and documentation for this project were AI-generated
under human direction and should be reviewed before production use.

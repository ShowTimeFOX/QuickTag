// Docs page content (pages/docs.html). Plain data only: scripts/docs/render.js
// turns it into DOM with createElement/textContent, so nothing here is parsed
// as HTML.
//
// HOW TO EDIT
// - Write for everyday users: what to click and what happens, in plain
//   English. No file names, module names, or storage keys.
// - One entry in DOCS_SECTIONS = one item in the sidebar. Its `id` is the
//   page address (docs.html#<id>); keep existing ids stable, other pages link
//   to them.
// - New feature: add blocks to the section where people would look for it,
//   and mark the heading with `since: "x.y.z"` for a small version badge.
// - New common problem: add an item to the `faq` block in "troubleshooting".
// - New release: add an entry at the top of RELEASES (newest first).
//
// Blocks (each is an object with one of these shapes):
//   { heading: "Title", since: "1.2.0" }   sub-heading, optional badge
//   { p: "Text" }                           paragraph
//   { steps: ["First", "Then"] }           numbered steps
//   { list: ["Point", "Point"] }           bullet list
//   { code: "text" }                        code or example block
//   { tip: "Text" } / { warning: "Text" }  highlighted note
//   { faq: [{ q: "Question", a: [blocks] }] }  expandable questions
//   { releases: true }                      the RELEASES list (What's New)
//
// Inline text supports **bold**, `code` (also for keys and buttons' input),
// and [label](target). A target is another section ("#troubleshooting"), a
// section and question ("#troubleshooting/window-off-screen"), or an
// https:// address (opens in a new tab).

/** What's New, newest first. `highlights` use the same inline text. */
export const RELEASES = [
  {
    version: "1.2.0",
    label: "Upcoming",
    highlights: [
      "**Focus Mode** (`Alt+A`): a full-screen workspace with the image, your tags, and the palette side by side. Mute tags without deleting them, sort and clean up the list, and arrange the panels the way you like.",
      "**Assets tab**: browse and install community tag packs from File Hub in one click, preview what's inside first, and get updates when a newer version is published.",
      "**Pack switcher**: one searchable list of all your packs. Type a pack name or any tag inside a pack to find it, and uninstall packs with Undo. Or scroll the mouse wheel over it to flip through packs without opening the list (you can turn this off in Settings).",
      "**AI suggestions in the palette**: the AI button puts suggested tags in an \"AI\" group at the start of your groups, in the tagger and in Focus Mode.",
      "**Tag separator per site**: sites that separate tags with commas (or anything else) now work as expected.",
      "**Reduce visual effects** for slower computers, and smoother clicks and dragging on the title bar.",
      "This **Docs** page, with a Troubleshooting section for the most common questions.",
    ],
  },
  {
    version: "1.1.0",
    label: "October 2026",
    highlights: [
      "**Show or hide QuickTag everywhere** from the toolbar popup. Open tabs update right away, no reload needed.",
      "**Delete any tag pack**, including the ones that come with QuickTag (you can import them again later).",
      "**Word wrap** in the palette editor, with line numbers that stay aligned.",
    ],
  },
];

/** Sidebar order = array order. `icon` is a 16×16 stroke path. */
export const DOCS_SECTIONS = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "M8 2.5 13.5 8 8 13.5M2.5 8h11",
    summary: "Open QuickTag on a page and add your first tags.",
    blocks: [
      { heading: "Open the tagger" },
      { p: "On a site you haven't used QuickTag on yet, you'll see only a small tab on the right edge of the page. Click it to open the tagger window." },
      {
        list: [
          "Click the **QuickTag icon** in your browser's toolbar to show or hide QuickTag on every page at once (**Global visibility**).",
          "The tagger remembers whether it was open, docked, or hidden **separately for each site**.",
        ],
      },
      { heading: "Tag an image" },
      {
        steps: [
          "Open a page with an image and a tag field (for example, an upload or edit page).",
          "In the **Tagging** tab, choose a tag pack, then a group and a category.",
          "Click a tag to add it to the page's tag field. Click it again to remove it.",
          "Use **Copy** to copy all tags, or **Clear** to empty the tag field. The counter shows how many tags you have.",
        ],
      },
      { tip: "If clicking a tag does nothing, QuickTag hasn't found this site's tag field yet. See [Site Profiles & Auto-Detect](#site-profiles) to point it at the right field." },
      { heading: "Find tags by typing" },
      {
        p: "Start typing anywhere on the page (outside a text field) to search your tags, or use the search box. Typos are fine. Use the arrow keys to pick a result, `Enter` to add it, and `Esc` to clear the search.",
      },
      { heading: "The tabs" },
      {
        list: [
          "**Tagging**: your tag packs and the palette.",
          "**Settings**: the site profile, AI suggestions, window look and size, Focus Mode, and backups.",
          "**Assets**: community tag packs from File Hub.",
          "**About**: a short overview, with a link to these Docs.",
        ],
      },
    ],
  },
  {
    id: "palette-ai",
    title: "Tag Palette & AI Suggestions",
    icon: "M3 3.5h10M3 8h10M3 12.5h10",
    summary: "Organize your tags, switch packs, and let AI suggest tags for an image.",
    blocks: [
      { heading: "Packs, groups, and categories" },
      {
        p: "Tags live in **packs**. Each pack has **groups** (the top row of tabs) and each group has **categories** (the second row). Turn on **Flat view** to see every category of a group at once. **+ All** adds every tag you can see, or removes them if they're all added already.",
      },
      { heading: "Switch or search packs", since: "1.2.0" },
      {
        p: "Click the pack selector to open the list of all your packs. Type to search pack names and even the tags inside them. A matching tag is shown under its pack. Click a pack, or use the arrow keys and `Enter`. `Esc` or a click outside closes the list.",
      },
      {
        p: "**Uninstall** (in the list, or in the palette header) removes a pack right away. Changed your mind? Click **Undo** within a few seconds.",
      },
      { heading: "Flip through packs with the mouse wheel", since: "1.2.0" },
      {
        p: "Without opening the list, scroll the mouse wheel over the pack selector (in the tagger or in Focus Mode). Your packs appear in a small reel and slide past under the pointer, so you can keep the mouse still. When the pack you want is highlighted, click it. Move the pointer away, wait a moment, press `Esc`, or click elsewhere to close it without switching.",
      },
      { p: "Don't want it? Turn off **Settings › Interface › Ghost scroll on the pack selector**. The wheel then scrolls the tagger as usual." },
      { heading: "Import, export, and edit packs" },
      {
        list: [
          "**Import** adds a pack from a `.json` file. **Export** saves the selected pack as a file.",
          "**Edit** opens the pack in the editor. Press **Save** (or `Ctrl+S`) to keep your changes.",
          "**Settings › Configuration** backs up or restores your whole QuickTag setup, or restores the defaults.",
        ],
      },
      { p: "A pack file looks like this. Groups contain categories, and categories contain lists of tags:" },
      {
        code: '{\n  "name": "Landscape Pack",\n  "groups": {\n    "Environment": {\n      "Location": ["forest", "mountain", "beach"],\n      "Weather": ["sunny", "rain", "snow"]\n    }\n  }\n}',
      },
      { heading: "AI suggestions", since: "1.2.0" },
      {
        p: "Click **AI** in the palette to have the image on the page analyzed. While it works the button shows a spinner. Suggested tags then appear in an **\"AI\"** group at the start of your groups, in the tagger and in Focus Mode. Click them like any other tag.",
      },
      {
        list: [
          "**Settings › AI suggestions › Threshold**: lower it to get more suggestions, raise it to get only the most certain ones.",
          "**AI tag blacklist**: tags you never want suggested.",
          "The \"AI\" group is never saved into your pack.",
        ],
      },
      { heading: "Set up AI on your computer" },
      {
        p: "AI suggestions run on your own computer with ComfyUI and the WD14 Tagger node, so your images aren't sent anywhere else. You only need this for AI; everything else works without it.",
      },
      {
        steps: [
          "Install **Python 3** and **Git**, then open PowerShell in the folder where ComfyUI should live.",
          "Install ComfyUI with comfy-cli:",
        ],
      },
      { code: "python -m venv .venv\n.\\.venv\\Scripts\\Activate.ps1\npython -m pip install --upgrade pip\npython -m pip install comfy-cli\ncomfy install" },
      {
        steps: [
          "In ComfyUI, open **Menu › Extensions** (ComfyUI-Manager), search for **WD14 Tagger**, and install it.",
          "Start ComfyUI like this and keep the window open while you tag:",
        ],
      },
      { code: "comfy launch -- --listen 127.0.0.1 --port 8188 --disable-auto-launch --lowvram --enable-cors-header" },
      { tip: "The `--enable-cors-header` part matters: without it, QuickTag can't talk to ComfyUI. Need more detail? See the [comfy-cli guide](https://github.com/Comfy-Org/comfy-cli) and the [WD14 Tagger guide](https://github.com/pythongosssss/ComfyUI-WD14-Tagger)." },
    ],
  },
  {
    id: "window",
    title: "Window Controls, Ghost Mode & Focus Mode",
    icon: "M2.5 3.5h11v9h-11zM2.5 6h11",
    summary: "Move, resize, and dock the tagger, see through it, or switch to a full-screen workspace.",
    blocks: [
      { heading: "Move and resize" },
      {
        list: [
          "**Move**: drag the window by its title. Clicking the buttons in the title bar never moves the window.",
          "**Resize**: drag the `◢` corner at the bottom left.",
          "**Size**: **Settings › Interface › Window scale** makes everything bigger or smaller.",
          "**Dock**: **Settings › Interface › Dock** attaches the window to an edge of the page, and the page makes room for it. Choose the edge next to it.",
        ],
      },
      { heading: "Collapse or hide" },
      {
        list: [
          "The **collapse** button in the title bar shrinks the window to just its title bar.",
          "The **hide** button tucks it away to the edge of the screen. Click the small tab on the edge to bring it back.",
        ],
      },
      { heading: "Ghost Mode" },
      {
        p: "Ghost Mode makes the tagger see-through, so you can look at the image behind it. Click the **ghost** button in the title bar or press `Ctrl+Shift+G`. In **Settings › Interface** you can change the shortcut, or turn on **Hold only** so it's see-through only while you hold the button or the keys.",
      },
      { heading: "Focus Mode", since: "1.2.0" },
      {
        p: "Press `Alt+A` (`Option+A` on a Mac) or click the **Focus Mode** button next to the ghost button. You get the page image, your tag list, and the palette side by side. `Esc` closes an open menu first, then Focus Mode.",
      },
      {
        list: [
          "**Image**: scroll to zoom, drag to move. Double-click, **Fit**, or **1:1** resets the view.",
          "**Tags**: click a tag to **mute** it (it leaves the page but stays in your list), click again to bring it back, or `×` to remove it. Type in the box to add tags.",
          "**Sort, Deduplicate, Copy, Clear** sit next to the \"Tags\" heading. **Raw text** lets you edit the tags as plain text.",
          "**Live sync** keeps the page's tag field up to date as you work. Turn it off to apply changes yourself with **Apply to page**.",
        ],
      },
      { heading: "Arrange Focus Mode", since: "1.2.0" },
      {
        p: "Click **Customize** in the top bar. Arrows move a panel (it swaps places with its neighbor), and **Width** and **Height** make it bigger or smaller. Type a name and click **Save as new layout** to keep the arrangement in the **Layout** list. **Settings › Focus Mode** has the shortcuts and a separate size for Focus Mode.",
      },
    ],
  },
  {
    id: "site-profiles",
    title: "Site Profiles & Auto-Detect",
    icon: "M8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8 1.5v3M8 11.5v3M1.5 8h3m7 0h3",
    summary: "Tell QuickTag where a site keeps its tag field, image, and source link.",
    blocks: [
      { p: "Every site builds its pages differently. A **site profile** tells QuickTag where to find three things on a page: the **tag field**, the **image**, and the **source link**." },
      { heading: "How auto-detect works" },
      {
        p: "Each profile has a **URL pattern**. When you open a page, QuickTag uses the first profile whose pattern matches the page's address. If none matches, it uses the general `.*` profile, which tries common field names that work on many sites. **Settings › Current page profile** shows which profile is used right now.",
      },
      { heading: "Set up a site in a minute" },
      {
        steps: [
          "Open a page of the site, then **Settings › Current page profile**.",
          "Click **Pick element** next to **Tag input**, then click the page's tag field. Press `Esc` to cancel.",
          "Do the same for **Image** and, if you need it, **Source link / field**.",
          "If the site separates tags with commas, enter `, ` as the **Tag separator**. Leave it empty for spaces.",
        ],
      },
      { p: "Your picks are saved right away, in a profile for this site that covers all of its pages. **Add profile for this site** creates that profile without picking anything." },
      { heading: "Edit profiles by hand" },
      {
        p: "**Edit profiles** opens all profiles in the editor. Each one has a URL pattern and the three selectors. Profiles higher in the list win when several match. Save with **Save** or `Ctrl+S`.",
      },
      {
        code: '"example.com": {\n  "urlPattern": "^https://example\\\\.com/posts/\\\\d+",\n  "tagInputSelector": "#tags",\n  "imgSelector": "#image",\n  "linkSelector": "input[name=\'source\']",\n  "tagSeparator": ", "\n}',
      },
      {
        p: "URL patterns are **regular expressions**, not simple wildcards. The parts you'll need most:",
      },
      {
        list: [
          "`.*` means \"anything\". For example `example\\.com/.*` matches every page of the site.",
          "`\\d+` means \"any number\", handy for post IDs: `example\\.com/posts/\\d+`.",
          "`\\.` is a real dot. A plain `.` matches any character.",
          "`^` means \"starts with\": `^https://example\\.com` only matches that site.",
        ],
      },
      { tip: "In the editor, a backslash is written twice (`\\\\d+`), as in the example above." },
    ],
  },
  {
    id: "assets",
    title: "Assets & File Hub",
    icon: "M2.5 5 8 2.5 13.5 5v6L8 13.5 2.5 11zM2.5 5 8 7.5 13.5 5M8 7.5v6",
    summary: "Install community tag packs and keep them up to date.",
    blocks: [
      { heading: "Browse and install", since: "1.2.0" },
      {
        p: "The **Assets** tab lists the QuickTag tag packs published on [File Hub](https://showtimefox-file-hub.pages.dev/). Search, filter by category, and sort. Then:",
      },
      {
        list: [
          "**Preview** (the eye button) shows the groups, categories, and first tags of a pack before you install it.",
          "**Install** adds the pack and selects it in the Tagging tab.",
          "**Update** appears when File Hub has a newer version. Click it twice to confirm: it replaces the pack, including any edits you made to it.",
          "**Uninstall** removes it, with **Undo** for a few seconds.",
          "**Show in Hub** (the open-in-new-tab button) opens the pack's own page on File Hub.",
        ],
      },
      { heading: "Safe and private" },
      {
        list: [
          "QuickTag contacts File Hub only when you open the Assets tab or click **Refresh**.",
          "Every download is checked before it's saved: it must match the checksum File Hub publishes, be at most 2 MB, and be a valid tag pack.",
        ],
      },
      { heading: "Plugins and other files" },
      { p: "Right now QuickTag installs **JSON tag packs** only. Other kinds of packages (such as ZIP files or plugins) are shown as **Not supported**." },
      { heading: "Permission to download" },
      {
        p: "If the browser hasn't allowed QuickTag to reach the download sites yet, a small QuickTag window asks for it when you click **Install** or **Preview**. Click **Allow access**, and the download continues.",
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    icon: "M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.5M8 11.3v.2",
    summary: "Common problems and how to fix them.",
    blocks: [
      {
        faq: [
          {
            id: "window-moved",
            q: "The window moved when I clicked a button",
            a: [
              { p: "Clicking buttons in the title bar no longer moves the window (fixed in v1.2.0). The window only moves when you drag its **title**, and only after the pointer travels a few pixels." },
              { p: "If an older version moved it, drag it back by the title, or use one of the fixes below." },
            ],
          },
          {
            id: "window-off-screen",
            q: "The window is off-screen or I can't find it",
            a: [
              {
                list: [
                  "Click the small tab on the edge of the page, if you see one. The window was hidden, not lost.",
                  "Resize the browser window or change **Settings › Interface › Window scale**. QuickTag then pulls the window back inside the page.",
                  "Click **Dock**, then **Undock**, to start from a known position.",
                  "Still hidden everywhere? Click the toolbar icon and check that **Global visibility** is on.",
                ],
              },
            ],
          },
          {
            id: "url-pattern",
            q: "My site profile doesn't match pages with IDs or `*`",
            a: [
              { p: "URL patterns are regular expressions, so `*` on its own doesn't mean \"anything\". Use `.*` instead, and `\\d+` for a number:" },
              { code: "Doesn't work:  example.com/posts/*\nWorks:        example\\.com/posts/\\d+\nAlso works:   example\\.com/posts/.*" },
              {
                p: "**Settings › Current page profile** shows which profile matched. If it still says `.*`, check the pattern for typos, and move your profile above broader ones in **Edit profiles**. The easiest fix is **Add profile for this site**, which writes a pattern for the whole site for you.",
              },
            ],
          },
          {
            id: "profile-elements",
            q: "Tags don't appear in the page's tag field (or the wrong image is used)",
            a: [
              {
                list: [
                  "Open **Settings › Current page profile** and click **Pick element** next to **Tag input**, then click the actual tag field. Do the same for **Image**.",
                  "Pick a real text field for tags and a real image for Image. QuickTag won't accept other elements there.",
                  "Some sites build the field only after you click something (like an **Edit** button). Open it first, then pick.",
                  "Tags end up in one long word, or split wrong? Set the **Tag separator** (for example `, `).",
                ],
              },
            ],
          },
          {
            id: "unsaved-changes",
            q: "I lost my changes in the editor, or it warns about unsaved changes",
            a: [
              {
                p: "The pack and profile editor shows **Unsaved changes** until you click **Save** (or press `Ctrl+S`). If you close the tab before saving, your browser asks you first. Choose to stay, then save.",
              },
              {
                p: "Changes in the tagger itself (picked elements, separator, settings, Focus Mode layouts) are saved right away. Back up your setup from time to time in **Settings › Configuration**.",
              },
            ],
          },
          {
            id: "file-hub",
            q: "Assets won't load, or a pack won't install",
            a: [
              {
                list: [
                  "Check your internet connection and click **Refresh** in the Assets tab. File Hub might be briefly unavailable; try again in a minute.",
                  "If QuickTag asks for permission, click **Allow access**. In Firefox you can also allow it in `about:addons` › QuickTag LazyMod › **Permissions**.",
                  "**Not supported** means the package isn't a JSON tag pack. QuickTag can't install it yet.",
                  "A failed check means the download didn't match what File Hub published. Nothing was saved. Try again later.",
                ],
              },
            ],
          },
          {
            id: "comfyui",
            q: "AI suggestions don't work",
            a: [
              {
                list: [
                  "Make sure ComfyUI is running and its window is still open.",
                  "Start it with `--enable-cors-header` (see [Set up AI](#palette-ai)). Without it, ComfyUI refuses QuickTag.",
                  "\"Node not found\": install WD14 Tagger in ComfyUI, then restart ComfyUI.",
                  "Too many or too few tags? Change the **Threshold** in **Settings › AI suggestions** and run AI again.",
                ],
              },
            ],
          },
          {
            id: "after-update",
            q: "Something looks stuck after an update",
            a: [{ p: "Reload the page. If that doesn't help, restart the browser so every part of QuickTag starts fresh with the new version." }],
          },
        ],
      },
      { tip: "Still stuck? Report it on [GitHub](https://github.com/ShowTimeFOX/QuickTag/issues) with the steps that cause it." },
    ],
  },
  {
    id: "whats-new",
    title: "What's New",
    icon: "M8 1.5 9.8 6l4.7.3-3.6 3 1.2 4.6L8 11.4l-4.1 2.5 1.2-4.6-3.6-3L6.2 6z",
    summary: "Highlights from each version.",
    blocks: [{ releases: true }],
  },
];

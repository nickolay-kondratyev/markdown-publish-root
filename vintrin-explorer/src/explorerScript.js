/**
 * Explorer inline script (afterDOMLoaded), ported from the stock
 * @quartz-community/explorer `explorer.inline.ts` MINUS the contentIndex
 * fetch + client-side trie render: our tree is server-rendered per page, and
 * Quartz's SPA swaps the whole body on nav, so each page already arrives with
 * the correct active link and open ancestor folders.
 *
 * What remains (stock-equivalent behavior):
 *   - localStorage "fileTree" collapse persistence keyed by data-folderpath
 *     (the ORIGINAL vault folder path)
 *   - folder collapse toggles (icon + button — folders are collapse-only)
 *   - mobile hamburger toggle + mobile-no-scroll handling
 *   - explorer scroll position save/restore across SPA navs
 */
export const EXPLORER_SCRIPT = `
(function () {
  var STORAGE_KEY = "fileTree"

  function loadSavedState() {
    try {
      var state = {}
      JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").forEach(function (item) {
        state[item.path] = item.collapsed
      })
      return state
    } catch (e) {
      return {}
    }
  }

  function persistFolderState(folderPath, collapsed) {
    var saved = []
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
    } catch (e) {}
    var existing = saved.findIndex(function (item) { return item.path === folderPath })
    if (existing >= 0) saved[existing].collapsed = collapsed
    else saved.push({ path: folderPath, collapsed: collapsed })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  }

  function toggleFolder(folderContainer) {
    var outer = folderContainer.nextElementSibling
    if (!outer) return
    outer.classList.toggle("open")
    persistFolderState(folderContainer.dataset.folderpath, !outer.classList.contains("open"))
  }

  function applySavedState(explorer) {
    var savedState = loadSavedState()
    var containers = explorer.querySelectorAll(".folder-container")
    for (var i = 0; i < containers.length; i++) {
      var container = containers[i]
      var outer = container.nextElementSibling
      if (!outer) continue
      var saved = savedState[container.dataset.folderpath]
      if (saved === undefined) continue
      if (saved === false) {
        outer.classList.add("open")
      } else if (!outer.querySelector("a.active")) {
        // Never close an ancestor of the active page (server opened it).
        outer.classList.remove("open")
      }
    }
  }

  function setupExplorer() {
    var cleanupHandlers = []
    var explorers = document.querySelectorAll("div.explorer")

    for (var i = 0; i < explorers.length; i++) {
      var explorer = explorers[i]
      applySavedState(explorer)

      var toggles = explorer.getElementsByClassName("explorer-toggle")
      for (var t = 0; t < toggles.length; t++) {
        var toggleHandler = function () {
          var nearest = this.closest(".explorer")
          if (!nearest) return
          var collapsed = nearest.classList.toggle("collapsed")
          nearest.setAttribute("aria-expanded", collapsed ? "false" : "true")
          if (!collapsed) document.documentElement.classList.add("mobile-no-scroll")
          else document.documentElement.classList.remove("mobile-no-scroll")
        }
        toggles[t].addEventListener("click", toggleHandler)
        cleanupHandlers.push({ el: toggles[t], fn: toggleHandler })
      }

      var icons = explorer.getElementsByClassName("folder-icon")
      for (var c = 0; c < icons.length; c++) {
        var iconHandler = function (evt) {
          evt.stopPropagation()
          if (this.parentElement) toggleFolder(this.parentElement)
        }
        icons[c].addEventListener("click", iconHandler)
        cleanupHandlers.push({ el: icons[c], fn: iconHandler })
      }

      var buttons = explorer.getElementsByClassName("folder-button")
      for (var b = 0; b < buttons.length; b++) {
        var buttonHandler = function (evt) {
          evt.stopPropagation()
          var container = this.closest(".folder-container")
          if (container) toggleFolder(container)
        }
        buttons[b].addEventListener("click", buttonHandler)
        cleanupHandlers.push({ el: buttons[b], fn: buttonHandler })
      }

      // Restore scroll position, else bring the active link into view.
      var explorerUl = explorer.querySelector(".explorer-ul")
      if (explorerUl) {
        var scrollTop = sessionStorage.getItem("explorerScrollTop")
        if (scrollTop) {
          explorerUl.scrollTop = parseInt(scrollTop, 10)
        } else {
          var active = explorerUl.querySelector("a.active")
          if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" })
        }
      }

      // Mobile: reveal the hamburger and start collapsed when it is visible.
      var mobileToggle = explorer.querySelector(".mobile-explorer")
      if (mobileToggle) {
        mobileToggle.classList.remove("hide-until-loaded")
        if (mobileToggle.checkVisibility && mobileToggle.checkVisibility()) {
          explorer.classList.add("collapsed")
          explorer.setAttribute("aria-expanded", "false")
          document.documentElement.classList.remove("mobile-no-scroll")
        }
      }
    }

    if (window.addCleanup) {
      window.addCleanup(function () {
        cleanupHandlers.forEach(function (h) { h.el.removeEventListener("click", h.fn) })
      })
    }
  }

  document.addEventListener("nav", setupExplorer)
  document.addEventListener("render", setupExplorer)
  document.addEventListener("prenav", function () {
    var explorerUl = document.querySelector(".explorer-ul")
    if (!explorerUl) return
    sessionStorage.setItem("explorerScrollTop", explorerUl.scrollTop.toString())
  })
})()
`

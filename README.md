<img src="./.github/readme/logo.png" alt="Wraeclast Market" width="200">

# Wraeclast Market

A browser extension that enhances the pathofexile.com trade site experience for Path of Exile and Path of Exile 2. (Based on the [Better Trading](https://github.com/exile-center/better-trading) extension.)

<a href="https://chromewebstore.google.com/detail/pibpmppndelgnpenlnlcpgelhnpilomk" target="_blank">
  <img src="./.github/readme/chrome-button.png" alt="Available in the Chrome Web Store">
</a>

## Why not Firefox ?

- Initially, the extension did not work in Firefox. Booting Ember.js as a browser extension is not something that works well within Firefox's addon runtime. The first Firefox version relied on hacks and as expected, it broke after doing some updates. Having to hack into libs to make sure they can work in Firefox is not something that I want to do in my spare time;
- Firefox addon store review process for new updates is way more strict and time-consuming to deal with compared to Chrome's;
- The project is developed as a Chrome-first project, which means problems can be quickly detected during development instead of having to test everything twice;
- Now that both Chrome and Firefox versions have been live for a while, I can see that Firefox represented less than 10% of BetterTrading users;

In the meantime, you can continue to use version [1.3.2 on Firefox](https://addons.mozilla.org/en-US/firefox/addon/better-pathofexile-trading/) or you can use Chrome for your PoE business ✌️

## Features

- Works on both **Path of Exile** and **Path of Exile 2** trade sites
- Bookmarks manager — organize searches into folders with class / currency icons
- Equivalent pricing calculator (powered by [poe.ninja](https://poe.ninja/))
- Searched mods highlighting
- **Apply stat filters from results** — inline min/max inputs + one-click Apply
- Regroup similar results
- Pin items & search history
- Warning for armours that cannot be 6-socketed (PoE 1 only)
- ... more to come !

## Contributing

1. Make sure Node.js (18+) and NPM (8+) are installed (the build runs on Node 24 via `NODE_OPTIONS=--openssl-legacy-provider`);
2. Install the dependencies with `make dependencies`;
3. Build the project with `make dev`;
4. Install the local extension located at `./dist/dev`.

The command `make package` can be used to generated the store-ready zip files (chrome and firefox).

Don't forget to run `make help` to know more about the other commands.

**Useful resources**

- [How to install a local extension](https://developer.chrome.com/extensions/getstarted)
- [Extension reloader](https://chrome.google.com/webstore/detail/extensions-reloader/fimgfedafeadlieiabdeeaodndnlbhid)

## Credits

- Button icons (**papers** on "Copy for PoB", **magnifying-glass** on "Apply") by [Lorc](https://lorcblog.blogspot.com/) from [game-icons.net](https://game-icons.net/), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

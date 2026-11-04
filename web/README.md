# Finder page

The site's UI: Vite, React and shadcn/ui (Base UI). `npm run build` writes `dist/index.html` with a `__DATA__` placeholder; `dabang_build_finder.js` fills it with the listings and copies `dist/assets` to `_site/assets`, shared by the long-term page and `short/`.

- `npm run dev` serves the page with no data. To work with real listings, run `npm run build`, then `node preview.js` from the repo root, and serve `_site`.
- `npm run lint` before committing.
- Saved listings and filters live in localStorage under `finder-favourites-v2` and `finder-filters-v2` (`-short` on the Short term tab). Keep those keys so people keep what they saved.

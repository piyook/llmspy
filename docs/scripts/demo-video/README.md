# Docs homepage demo video

`record.mjs` records the video under "Try it" on the docs homepage (`docs/public/videos/llmspy-demo.webm` and its poster `llmspy-demo.jpg`). Re-record it when the UI changes.

The video is a real session: a scripted terminal (`stage.html`) runs a small agent whose calls go through a running LLMSpy to llmock, and the live LLMSpy UI is shown beside it in an iframe. It shows a tool loop as a conversation, the Compare view, and a failed call with its 429 reply.

## Running it

From the repository root, in three terminals or with the first two in the background:

```bash
npm run build
cd mock && npx llmock start --model=claude --foreground          # port 8001
LLMSPY_UPSTREAMS=llmock=http://127.0.0.1:8001 HOME=/tmp/llmspy-demo USERPROFILE=/tmp/llmspy-demo npm start
```

Then:

```bash
npm install --no-save playwright           # not a project dependency
npx playwright install chromium ffmpeg     # browser, and ffmpeg with the VP9 encoder
node docs/scripts/demo-video/record.mjs --shots
```

- Run LLMSpy with an empty home folder as above (`USERPROFILE` on Windows, `HOME` elsewhere), so it uses a new, empty database and none of your own captured calls can appear in the video. The script clears that database before it starts.
- It adds the replies it needs to llmock through llmock's admin API and resets llmock afterwards.
- It writes the video and the poster into `docs/public/videos/`, about 27 seconds and 600 KB. Give a `.webm` path as an argument to write somewhere else. `--shots` also saves three PNG stills to the system temp folder.
- The next `npm install` or `npm ci` removes Playwright again.

## How it works

- The stage page is loaded on LLMSpy's own origin (`/ping`, then its HTML), so the UI's iframe is same-origin: it lays out at full size, and the UI's API accepts its calls.
- The page uses the dark colour scheme, to match the screenshots in the docs.
- Frames are JPEG screenshots at 1.5x (1920x1080), placed on a 15 fps timeline and piped to Playwright's own ffmpeg, which can encode VP9 WebM but not MP4.

# Simple Editor

A non-linear, hierarchical approach to drafting and organizing complex documents.

![Screenshot](https://github.com/zhuochun/simple-editor/blob/e48a4dce0abcd28882f9a0bbcef9adde44c9fe5b/docs/screenshot-2025-03-31.png?raw=true)

All data are stored in your browser. You can export a project in plain text file for backup easily.

## Documentation

- [Domain and current behavior](docs/domain.md)
- [Data schema](docs/data-schema.md)
- [Architecture](docs/architecture.md)
- [Testing](docs/testing.md)
- [Historical project documents](docs/projects/README.md)

## AI Setup

Bring your own API key and configure it in the sidebar. Settings stay in this browser and are applied only when you choose **Save**. **Test** sends a minimal connection prompt without project content.

The built-in OpenAI preset uses the [Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses) with the latest explicit Thinking model selected for this release:

- Endpoint: `https://api.openai.com/v1/responses`
- Model: `gpt-5.6-sol`
- Thinking effort: `medium` by default; temperature is not sent

OpenRouter remains available through Chat Completions at `https://openrouter.ai/api/v1/chat/completions`; enter a model supported by your OpenRouter account. Custom providers require an explicit Responses or Chat Completions protocol, endpoint, model, and key.

AI requests stream into non-destructive Card or Option destinations. The status bar lets you cancel a running request, retries failed requests, and links successful Option results to their owning Card's History.

## Run Locally

Install `nvm` and then Node.js:

- Check the official `nvm` repository for the latest installation: [https://github.com/nvm-sh/nvm](https://github.com/nvm-sh/nvm)
- Install a specific version of Node.js:

``` bash
nvm install --lts
nvm use --lts
```

Install the pinned development dependencies and start the browser-native app:

```bash
npm install
npm run dev
```

Open the address printed by the local server. Run the complete unit, syntax, and browser verification with:

```bash
npx playwright install chromium
npm run verify
```

## Production build and deployment

Create the same optimized artifact used by GitHub Pages:

```bash
npm run build
npm run preview
```

The generated `dist/` directory contains bundled and minified HTML, CSS, and JavaScript. Source maps are disabled and rejected by the build. `dist/` is generated output and is not committed.

After the repository's Pages publishing source is set to **GitHub Actions**, pushes to `main` run the **Deploy Pages** workflow, which builds `dist/` and publishes it. The production URL is `https://editor.bicrement.com/`; the repository's Pages settings own that custom-domain association, while the DNS host owns the `editor` CNAME record.

## Credits

Built with vibe by [Zhuochun](https://github.com/zhuochun) together with Gemini 2.5 Pro 🪄.

Buy me a coffee 🧋 on [GitHub Sponsor](https://github.com/sponsors/zhuochun)!

Star 🌟 this repo and share this tool on [X](https://x.com/zhuochun) 👍.

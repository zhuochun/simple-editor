# Simple Editor

A non-linear, hierarchical approach to drafting and organizing complex documents.

![Screenshot](https://github.com/zhuochun/simple-editor/blob/e48a4dce0abcd28882f9a0bbcef9adde44c9fe5b/docs/screenshot-2025-03-31.png?raw=true)

All data are stored in your browser. You can export a project in plain text file for backup easily.

## AI Setup

You need to bring your own keys, and configure them in the sidebar.

Use any OpenAI `completions` API compatible provider, e.g. [OpenAI](https://platform.openai.com/), [OpenRouter](https://openrouter.ai/), etc.

Provider URL:

- OpenAI: https://api.openai.com/v1/completions
- OpenRouter: https://openrouter.ai/api/v1/chat/completions

Model Name:

- OpenAI: `GPT-4o-mini` (From [Models](https://platform.openai.com/docs/models))
- OpenRouter: `deepseek/deepseek-chat-v3-0324:free` (From [Models](https://openrouter.ai/models))

## Run Locally

Install `nvm` and then Node.js:

- Check the official `nvm` repository for the latest installation: [https://github.com/nvm-sh/nvm](https://github.com/nvm-sh/nvm)
- Install a specific version of Node.js:

``` bash
nvm install --lts
nvm use --lts
```

Run `npx serve`: You can then open your web browser and navigate to that address.

## Credits

Built with vibe by [Zhuochun](https://github.com/zhuochun) together with Gemini 2.5 Pro 🪄.

Buy me a coffee 🧋 on [GitHub Sponsor](https://github.com/sponsors/zhuochun)!

Star 🌟 this repo and share this tool on [X](https://x.com/zhuochun) 👍.
# Security Model

Figma Batch AI is designed as a bring-your-own-key plugin.

## What The Plugin Stores

- API key, endpoint, and model are stored in `figma.clientStorage`.
- No default API key is included in source code.
- No data is sent to a plugin-owned backend.

## What The Plugin Sends

When the user runs a prompt, the UI sends:

- The user prompt.
- Recent chat messages.
- Tool schemas.
- Tool results that may include summaries of selected Figma layers.

Requests go directly to the model endpoint configured by the user.

## Canvas Mutation Rules

- The main thread exposes only allowlisted commands.
- Mutation commands operate on the current selection by default.
- Broad mutation commands require UI confirmation before execution.
- The main thread caps selection and QA traversal sizes.

## Recommended Public Release Checklist

- Review `manifest.json` allowed domains before publishing.
- Remove any company-specific examples from docs and prompts.
- Add a privacy policy if publishing to Figma Community.
- Add a clear warning that custom endpoints must be trusted by the user.

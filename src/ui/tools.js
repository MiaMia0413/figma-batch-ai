export const SYSTEM_PROMPT = [
  'You are Figma Batch AI, a careful assistant for editing existing Figma designs with natural language.',
  'The primary workflow is page-level editing: if the user names a target such as a specific button, tag, tab, card, list item, menu item, form control, section, or text phrase, pass that exact phrase as target and use page scope unless the user specifically refers to the current selection.',
  'Target phrases must come from the user request. Do not substitute a nearby word you saw during inspection. If the requested target is not visible in inspection results, ask for clarification instead of guessing a different label.',
  'If inspection does not reveal the requested target phrase, ask the user to clarify instead of guessing and editing a broader target.',
  'The secondary workflow is selection-level editing: when the user says selected/current selection, use selection scope. Even then, tools search descendants, so a selected group/frame can be edited through its inner text or background layers.',
  'Prefer inspect_canvas when you need context. It automatically inspects the current selection when one exists, otherwise the current page. Do not call inspect_canvas more than twice for one user request.',
  'For fill/background changes on controls or groups, use batch_set_fill with the original user target and keep includeText false unless the user explicitly asks to change text color. The tool will pick the most likely background layer inside each matched container.',
  'For text, title, subtitle, or copy color changes inside containers, use batch_set_fill with includeText true. When the request is like "dialog title color", pass target="title" and containerTarget="dialog".',
  'When the user asks to remove, clear, delete, or unset background/fill color, use batch_remove_fill instead of setting a transparent color.',
  'When the user asks to copy, duplicate, or clone a layer/frame/artboard/module, use duplicate_layers. Preserve requested count, placement, and layout such as "2 copies", "bottom-left", or "vertical".',
  'For broad edits, make the smallest useful change and summarize exactly what changed.',
  'Never invent node IDs.',
].join('\n');

export const TOOLS = [
  tool('inspect_canvas', 'Inspect Figma layers. With auto scope, selected layers are inspected if present; otherwise the current page is inspected.', scopeProps({
    limit: { type: 'number', description: 'Optional maximum number of nodes to inspect.' },
  })),
  tool('batch_set_text', 'Replace matching text layers with the same text, or replace only the matched substring when replaceOnly is true. For "change A to B" requests, use target=A, text=B, replaceOnly=true.', targetProps({
    text: { type: 'string', description: 'New text content.' },
    replaceOnly: { type: 'boolean', description: 'Set true to replace only occurrences of target inside each matched text layer.' },
  }), ['text']),
  tool('batch_set_fill', 'Set solid fill color on the most likely background layer inside each matching target container. Skips text by default.', targetProps({
    color: { type: 'string', description: 'Hex color like #2563EB.' },
    includeText: { type: 'boolean', description: 'Set true only when the user explicitly asks to change text color.' },
    containerTarget: { type: 'string', description: 'Optional container phrase for nested text targets, such as dialog/modal/card when target is title/text/copy inside it.' },
  }), ['color']),
  tool('batch_remove_fill', 'Remove fills from the most likely background layer inside each matching target container. Use this for remove/clear/delete/unset background or fill color requests.', targetProps({})),
  tool('batch_set_corner_radius', 'Set corner radius on matching layers that support it.', targetProps({
    radius: { type: 'number', description: 'Corner radius in pixels, 0 to 200.' },
  }), ['radius']),
  tool('batch_set_opacity', 'Set opacity on matching layers.', targetProps({
    opacity: { type: 'number', description: 'Opacity from 0 to 1.' },
  }), ['opacity']),
  tool('batch_set_visible', 'Show or hide matching layers.', targetProps({
    visible: { type: 'boolean', description: 'False hides matching layers, true shows them.' },
  }), ['visible']),
  tool('batch_resize', 'Resize matching resizable layers.', targetProps({
    width: { type: 'number', description: 'Optional width in pixels.' },
    height: { type: 'number', description: 'Optional height in pixels.' },
  })),
  tool('batch_rename_layers', 'Rename matching layers with prefix, suffix, replace, or list mode.', targetProps({
    mode: { type: 'string', enum: ['prefix', 'suffix', 'replace', 'list'] },
    text: { type: 'string', description: 'Name text for prefix, suffix, or replace mode.' },
    names: {
      type: 'array',
      items: { type: 'string' },
      description: 'One name per selected layer when mode is list.',
    },
  }), ['mode']),
  tool('duplicate_layers', 'Duplicate matching layers, frames, artboards, modules, or the current selection. Honors requested count, placement, and layout when provided, while avoiding overlap. With auto layout, left/right placement arranges copies horizontally, and top/bottom placement arranges copies vertically.', targetProps({
    count: { type: 'number', description: 'Number of copies to create for each target. Default is 1.' },
    placement: {
      type: 'string',
      enum: ['auto', 'right', 'left', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
      description: 'Preferred placement relative to the original target.',
    },
    layout: {
      type: 'string',
      enum: ['auto', 'horizontal', 'vertical'],
      description: 'How multiple copies should be arranged from the preferred placement.',
    },
  })),
  tool('design_qa_check', 'Scan selected layers, or the current page when nothing is selected, for lightweight design QA issues.', scopeProps({})),
];

export const CONFIRM_TOOLS = new Set([
  'batch_set_text',
  'batch_set_fill',
  'batch_remove_fill',
  'batch_set_corner_radius',
  'batch_set_opacity',
  'batch_set_visible',
  'batch_resize',
  'batch_rename_layers',
]);

function tool(name, description, properties, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

function targetProps(properties) {
  return {
    ...scopeProps(properties),
    target: {
      type: 'string',
      description: 'Natural-language target phrase copied from the user request, such as a named button, tag, tab, card, list item, menu item, form control, section, or text phrase. Do not replace it with a different label found during inspection.',
    },
  };
}

function scopeProps(properties) {
  return {
    ...properties,
    scope: {
      type: 'string',
      enum: ['auto', 'page', 'selection'],
      description: 'Use page for named targets across the design, selection only when the user explicitly refers to selected/current layers, and auto when unsure.',
    },
  };
}

const SCOPE_PROPERTY = {
  type: 'string',
  enum: ['auto', 'page', 'selection'],
  description:
    'Use page for named targets across the design, selection only when the user explicitly refers to selected/current layers, and auto when unsure.',
};

const TARGET_PROPERTY = {
  type: 'string',
  description:
    'Natural-language target phrase copied from the user request, such as a named button, tag, tab, card, list item, menu item, form control, section, or text phrase. Do not replace it with a different label found during inspection.',
};

export const TOOL_REGISTRY = [
  entry(
    'inspect_canvas',
    'Inspect Figma layers. With auto scope, selected layers are inspected if present; otherwise the current page is inspected.',
    scopeParameters({
      limit: { type: 'number', description: 'Optional maximum number of nodes to inspect.' },
    }),
  ),
  mutationEntry(
    'batch_set_text',
    'Replace matching text layers with the same text, or replace only the matched substring when replaceOnly is true. For "change A to B" requests, use target=A, text=B, replaceOnly=true.',
    targetParameters(
      {
        text: { type: 'string', description: 'New text content.' },
        replaceOnly: {
          type: 'boolean',
          description: 'Set true to replace only occurrences of target inside each matched text layer.',
        },
      },
      ['text'],
    ),
    'batch',
  ),
  mutationEntry(
    'batch_set_fill',
    'Set solid fill color on the most likely background layer inside each matching target container. Skips text by default.',
    targetParameters(
      {
        color: { type: 'string', description: 'Hex color like #2563EB.' },
        includeText: {
          type: 'boolean',
          description: 'Set true only when the user explicitly asks to change text color.',
        },
        containerTarget: {
          type: 'string',
          description:
            'Optional container phrase for nested text targets, such as dialog/modal/card when target is title/text/copy inside it.',
        },
      },
      ['color'],
    ),
    'batch',
  ),
  mutationEntry(
    'batch_remove_fill',
    'Remove fills from the most likely background layer inside each matching target container. Use this for remove/clear/delete/unset background or fill color requests.',
    targetParameters({}),
    'batch',
  ),
  mutationEntry(
    'batch_set_corner_radius',
    'Set corner radius on matching layers that support it.',
    targetParameters(
      {
        radius: { type: 'number', description: 'Corner radius in pixels, 0 to 200.' },
      },
      ['radius'],
    ),
    'batch',
  ),
  mutationEntry(
    'batch_set_opacity',
    'Set opacity on matching layers.',
    targetParameters(
      {
        opacity: { type: 'number', description: 'Opacity from 0 to 1.' },
      },
      ['opacity'],
    ),
    'batch',
  ),
  mutationEntry(
    'batch_set_visible',
    'Show or hide matching layers.',
    targetParameters(
      {
        visible: { type: 'boolean', description: 'False hides matching layers, true shows them.' },
      },
      ['visible'],
    ),
    'batch',
  ),
  mutationEntry(
    'batch_resize',
    'Resize matching resizable layers.',
    targetParameters({
      width: { type: 'number', description: 'Optional width in pixels.' },
      height: { type: 'number', description: 'Optional height in pixels.' },
    }),
    'batch',
  ),
  mutationEntry(
    'batch_rename_layers',
    'Rename matching layers with prefix, suffix, replace, or list mode.',
    targetParameters(
      {
        mode: { type: 'string', enum: ['prefix', 'suffix', 'replace', 'list'] },
        text: { type: 'string', description: 'Name text for prefix, suffix, or replace mode.' },
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'One name per selected layer when mode is list.',
        },
      },
      ['mode'],
    ),
    'batch',
  ),
  mutationEntry(
    'duplicate_layers',
    'Duplicate matching layers, frames, artboards, modules, or the current selection. Honors requested count, placement, and layout when provided, while avoiding overlap. With auto layout, left/right placement arranges copies horizontally, and top/bottom placement arranges copies vertically.',
    targetParameters({
      count: { type: 'number', description: 'Number of copies to create for each target. Default is 1.' },
      placement: {
        type: 'string',
        enum: [
          'auto',
          'right',
          'left',
          'top',
          'bottom',
          'top-left',
          'top-right',
          'bottom-left',
          'bottom-right',
        ],
        description: 'Preferred placement relative to the original target.',
      },
      layout: {
        type: 'string',
        enum: ['auto', 'horizontal', 'vertical'],
        description: 'How multiple copies should be arranged from the preferred placement.',
      },
    }),
    'duplicate',
  ),
  entry(
    'design_qa_check',
    'Scan selected layers, or the current page when nothing is selected, for lightweight design QA issues.',
    scopeParameters({}),
  ),
];

export const TOOL_REGISTRY_BY_NAME = new Map(TOOL_REGISTRY.map((metadata) => [metadata.name, metadata]));

function mutationEntry(name, description, parameters, preview) {
  return entry(name, description, parameters, {
    confirm: true,
    preview,
    mutates: true,
  });
}

function entry(name, description, parameters, options = {}) {
  const { confirm = false, preview = false, mutates = false } = options;
  return { name, description, parameters, confirm, preview, mutates };
}

function targetParameters(properties, required = []) {
  return parameters(
    {
      ...properties,
      scope: SCOPE_PROPERTY,
      target: TARGET_PROPERTY,
    },
    required,
  );
}

function scopeParameters(properties, required = []) {
  return parameters(
    {
      ...properties,
      scope: SCOPE_PROPERTY,
    },
    required,
  );
}

function parameters(properties, required) {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

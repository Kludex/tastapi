export interface CompiledPath {
  regex: RegExp | undefined;
  params: string[];
  convertors: string[];
  openApiPath: string;
}

const CONVERTORS: Record<string, string> = {
  str: "[^/]+",
  int: "\\d+",
  float: "\\d+(?:\\.\\d+)?",
  uuid: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
  path: ".+",
};

export function compilePath(path: string): CompiledPath {
  if (path !== "" && !path.startsWith("/")) {
    throw new Error(`Route paths must start with "/": "${path}"`);
  }
  const params: string[] = [];
  const convertors: string[] = [];
  const segments = path.split(/({[^{}]+(?:{[^{}]*}[^{}]*)*})/);
  const parts = segments.map((part, index) => {
    if (index % 2 === 0) {
      return part.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
    }
    const inner = part.slice(1, -1);
    const colon = inner.indexOf(":");
    const name = colon === -1 ? inner : inner.slice(0, colon);
    const convertor = colon === -1 ? "str" : inner.slice(colon + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || params.includes(name)) {
      throw new Error(`Invalid or duplicate path parameter "${name}" in "${path}"`);
    }
    params.push(name);
    convertors.push(convertor);
    return `(?<${name}>${CONVERTORS[convertor] ?? convertor})`;
  });
  const openApiPath = segments.map((part, index) =>
    index % 2 ? `{${params[(index - 1) / 2]}}` : part,
  );
  return {
    regex: params.length ? new RegExp(`^${parts.join("")}$`) : undefined,
    params,
    convertors,
    openApiPath: openApiPath.join(""),
  };
}

interface SegmentNode {
  entries: number[];
  children: Map<string, SegmentNode>;
}

/** Indexes templates by their leading literal segments, so a lookup only tests plausible ones. */
export class SegmentTree {
  private readonly root: SegmentNode = { entries: [], children: new Map() };
  private size = 0;

  insert(template: string): void {
    let node = this.root;
    for (const segment of template.split("/").slice(1)) {
      if (segment.includes("{")) {
        break;
      }
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { entries: [], children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.entries.push(this.size++);
  }

  /** Indexes of the templates that may match `path`, in insertion order. */
  candidates(path: string): number[] {
    const found = [...this.root.entries];
    let node: SegmentNode | undefined = this.root;
    for (const segment of path.split("/").slice(1)) {
      node = node.children.get(segment);
      if (node === undefined) {
        break;
      }
      found.push(...node.entries);
    }
    return found.sort((a, b) => a - b);
  }
}

export function checkPrefix(prefix: string): void {
  if (prefix !== "" && (!prefix.startsWith("/") || prefix.endsWith("/") || prefix.includes("{"))) {
    throw new Error(
      `Router prefixes must start with "/", not end with "/" and have no parameters: "${prefix}"`,
    );
  }
}

export function allowHeader(methods: Iterable<string>): string {
  const allowed = new Set(methods);
  if (allowed.has("GET")) {
    allowed.add("HEAD");
  }
  allowed.add("OPTIONS");
  return [...allowed].join(", ");
}

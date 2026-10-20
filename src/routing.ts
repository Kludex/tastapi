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

export function matchPrefix(prefix: string, path: string): string | undefined {
  if (!path.startsWith(prefix)) {
    return undefined;
  }
  const rest = path.slice(prefix.length);
  return rest === "" || rest.startsWith("/") ? rest : undefined;
}

export function checkPrefix(prefix: string): void {
  if (prefix !== "" && (!prefix.startsWith("/") || prefix.endsWith("/"))) {
    throw new Error(`Router prefixes must start with "/" and not end with "/": "${prefix}"`);
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

import { APPS } from "./apps.ts";

const apps = Object.fromEntries(Object.entries(APPS).map(([name, create]) => [name, create()]));

export default {
  fetch(request: Request): Promise<Response> | Response {
    const url = new URL(request.url);
    const [, framework = "", ...rest] = url.pathname.split("/");
    url.pathname = `/${rest.join("/")}`;
    return apps[decodeURIComponent(framework)]!.fetch(new Request(url, request));
  },
};

import { Router } from "tastapi";

class Database {
  users = [{ id: 1, name: "Ada" }];

  static async connect(): Promise<Database> {
    return new Database();
  }
}

interface State {
  db: Database;
}

export const app = new Router<State>();

app.get("/users", ({ state }) => state.db.users);

const state: State = { db: await Database.connect() };

export default { fetch: (request: Request) => app.fetch(request, state) };

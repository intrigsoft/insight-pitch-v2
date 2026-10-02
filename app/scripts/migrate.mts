import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
await sql.end();
console.log("Migrations applied to", new URL(process.env.DATABASE_URL!).pathname.slice(1));

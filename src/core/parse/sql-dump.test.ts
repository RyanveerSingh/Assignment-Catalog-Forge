import { describe, expect, it } from "vitest";
import type { Issue } from "../types";
import { parseSheet } from "./sheet";
import { looksLikeSqlDump, parseSqlDump } from "./sql-dump";

function find(issues: Issue[], code: string): Issue | undefined {
  return issues.find((i) => i.code === code);
}

function codes(issues: Issue[]): string[] {
  return issues.map((i) => i.code);
}

const MYSQL = [
  "-- MySQL dump 10.13  Distrib 8.0.36",
  "/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;",
  "DROP TABLE IF EXISTS `products`;",
  "CREATE TABLE `products` (",
  "  `id` int NOT NULL AUTO_INCREMENT,",
  "  `sku` varchar(32) NOT NULL,",
  "  `name` varchar(255) NOT NULL,",
  "  `price` decimal(10,2) DEFAULT NULL,",
  "  `stock` int DEFAULT '0',",
  "  PRIMARY KEY (`id`),",
  "  UNIQUE KEY `sku` (`sku`),",
  "  KEY `idx_name` (`name`(20)),",
  "  CONSTRAINT `fk_x` FOREIGN KEY (`id`) REFERENCES `t` (`id`)",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
  "LOCK TABLES `products` WRITE;",
  "INSERT INTO `products` (`id`, `sku`, `name`, `price`, `stock`) VALUES (1,'TC-PL-20','Planter, 20 cm (terracotta); unglazed',12.50,7),(2,'TC-PL-30','O\\'Brien\\'s ''favourite''',NULL,-3);",
  "INSERT INTO `products` (`id`, `sku`, `name`, `price`, `stock`) VALUES (3,'TC-PL-40','Line\\nbreak',1299.00,0);",
  "UNLOCK TABLES;",
].join("\n");

const POSTGRES = [
  "--",
  "-- PostgreSQL database dump",
  "--",
  "SET statement_timeout = 0;",
  "SET standard_conforming_strings = on;",
  "SELECT pg_catalog.set_config('search_path', '', false);",
  'CREATE TABLE public.products (',
  "    id integer NOT NULL,",
  '    sku character varying(32) NOT NULL,',
  '    "Unit Price" numeric(10,2),',
  "    note text",
  ");",
  "ALTER TABLE public.products OWNER TO shop;",
  "INSERT INTO \"products\" (\"id\", \"sku\", \"Unit Price\", \"note\") VALUES (1, 'A1', 12.5, 'C:\\temp');",
  "INSERT INTO \"products\" (\"id\", \"sku\", \"Unit Price\", \"note\") VALUES (2, 'A2', NULL, E'tab\\there');",
  "INSERT INTO \"products\" (\"id\", \"sku\", \"Unit Price\", \"note\") VALUES (3, 'A3', -1, 'it''s');",
].join("\n");

const COPY = [
  "--",
  "-- PostgreSQL database dump",
  "--",
  "\\restrict abc123",
  "CREATE TABLE public.products (",
  "    id integer NOT NULL,",
  "    sku text,",
  "    name text,",
  "    price numeric",
  ");",
  "COPY public.products (id, sku, name, price) FROM stdin;",
  "1\tA1\tVase\t12.50",
  "2\tA2\t\\N\t8",
  "3\tA3\tTab\\there \\\\ back\t-2.5",
  "\\.",
  "COPY public.categories (id, name) FROM stdin;",
  "1\tDecor",
  "\\.",
  "SELECT pg_catalog.setval('public.products_id_seq', 3, true);",
].join("\n");

describe("parseSqlDump: INSERT statements (EC-A20)", () => {
  it("EC-A20: mysqldump with backticks, multi-row VALUES, escapes, NULL and negatives", () => {
    const sheet = parseSqlDump(MYSQL, { maxRows: 100 });
    expect(sheet.headers).toEqual(["id", "sku", "name", "price", "stock"]);
    expect(sheet.originalHeaders).toEqual(["id", "sku", "name", "price", "stock"]);
    expect(sheet.sheetName).toBe("products");
    expect(sheet.totalRows).toBe(3);
    expect(sheet.rows).toEqual([
      { rowNumber: 1, cells: { id: "1", sku: "TC-PL-20", name: "Planter, 20 cm (terracotta); unglazed", price: "12.50", stock: "7" } },
      { rowNumber: 2, cells: { id: "2", sku: "TC-PL-30", name: "O'Brien's 'favourite'", price: "", stock: "-3" } },
      { rowNumber: 3, cells: { id: "3", sku: "TC-PL-40", name: "Line\nbreak", price: "1299.00", stock: "0" } },
    ]);
    expect(find(sheet.issues, "sql.table_used")).toMatchObject({ severity: "info", ec: "A20", value: "products" });
    expect(sheet.issues.some((i) => i.severity === "error")).toBe(false);
  });

  it("EC-A20: pg_dump with double-quoted identifiers, one row per statement, standard strings keep backslashes and E'' unescapes", () => {
    const sheet = parseSqlDump(POSTGRES, { maxRows: 100 });
    expect(sheet.originalHeaders).toEqual(["id", "sku", "Unit Price", "note"]);
    expect(sheet.headers).toEqual(["id", "sku", "unit_price", "note"]);
    expect(sheet.rows.map((r) => r.cells)).toEqual([
      { id: "1", sku: "A1", unit_price: "12.5", note: "C:\\temp" },
      { id: "2", sku: "A2", unit_price: "", note: "tab\there" },
      { id: "3", sku: "A3", unit_price: "-1", note: "it's" },
    ]);
    expect(find(sheet.issues, "sql.table_used")?.message).toContain("3 rows from 3 statements");
  });

  const columnSources: Array<[string, string, string[], Record<string, string>]> = [
    [
      "EC-A20: no column list takes the names from a preceding CREATE TABLE",
      "CREATE TABLE products (id INT PRIMARY KEY, sku TEXT, price DECIMAL(10,2), PRIMARY KEY (id));\nINSERT INTO products VALUES (1, 'A1', 9.99);",
      ["id", "sku", "price"],
      { id: "1", sku: "A1", price: "9.99" },
    ],
    [
      "EC-A20: no column list and no CREATE TABLE falls back to column_1..N",
      "INSERT INTO products VALUES (1, 'A1', 9.99);",
      ["column_1", "column_2", "column_3"],
      { column_1: "1", column_2: "A1", column_3: "9.99" },
    ],
    [
      "EC-A20: schema-qualified names and INSERT IGNORE",
      "INSERT IGNORE INTO `shop`.`products` (`sku`, `name`) VALUES ('A1', 'Vase');",
      ["sku", "name"],
      { sku: "A1", name: "Vase" },
    ],
    [
      "EC-A20: REPLACE INTO and a trailing ON DUPLICATE KEY UPDATE clause",
      "REPLACE INTO products (sku, name) VALUES ('A1', 'Vase') ON DUPLICATE KEY UPDATE name = VALUES(name);",
      ["sku", "name"],
      { sku: "A1", name: "Vase" },
    ],
    [
      "EC-A20: unquoted function calls, booleans and DEFAULT are kept verbatim",
      "INSERT INTO products (sku, created, active, note) VALUES ('A1', NOW(), TRUE, DEFAULT);",
      ["sku", "created", "active", "note"],
      { sku: "A1", created: "NOW()", active: "TRUE", note: "DEFAULT" },
    ],
    [
      "EC-A20: nested parentheses and commas inside an unquoted value",
      "INSERT INTO products (sku, geo) VALUES ('A1', ST_GeomFromText('POINT(1, 2)'));",
      ["sku", "geo"],
      { sku: "A1", geo: "ST_GeomFromText('POINT(1, 2)')" },
    ],
    [
      "EC-A20: Windows line endings",
      "CREATE TABLE p (\r\n  sku TEXT,\r\n  name TEXT\r\n);\r\nINSERT INTO p VALUES\r\n('A1', 'Vase'),\r\n('A2', 'Bowl');\r\n",
      ["sku", "name"],
      { sku: "A1", name: "Vase" },
    ],
    [
      "EC-A20: a UTF-8 BOM and leading comments before the first statement",
      "\uFEFF-- dump\n/* block\ncomment */\nINSERT INTO p (sku) VALUES ('A1');",
      ["sku"],
      { sku: "A1" },
    ],
  ];

  it.each(columnSources)("%s", (_name, text, headers, firstRow) => {
    const sheet = parseSqlDump(text, { maxRows: 100 });
    expect(sheet.headers).toEqual(headers);
    expect(sheet.rows[0]?.cells).toEqual(firstRow);
    expect(sheet.issues.some((i) => i.severity === "error")).toBe(false);
  });

  it("EC-A7: a tuple with fewer values than the column list is padded and flagged on the row", () => {
    const sheet = parseSqlDump("INSERT INTO p (sku, name, price) VALUES ('A1', 'Vase'), ('A2', 'Bowl', 8, 'extra');", { maxRows: 100 });
    expect(sheet.rows[0].cells).toEqual({ sku: "A1", name: "Vase", price: "" });
    expect(sheet.rows[1].cells).toEqual({ sku: "A2", name: "Bowl", price: "8" });
    const ragged = sheet.issues.filter((i) => i.code === "row.ragged");
    expect(ragged.map((i) => i.row)).toEqual([1, 2]);
    expect(ragged[1].value).toBe("extra");
  });

  it("EC-A14: rows beyond maxRows are counted, not returned", () => {
    const tuples = Array.from({ length: 12 }, (_, i) => `(${i + 1}, 'S${i + 1}')`).join(",");
    const sheet = parseSqlDump(`INSERT INTO p (id, sku) VALUES ${tuples};`, { maxRows: 5 });
    expect(sheet.rows).toHaveLength(5);
    expect(sheet.rows[4].cells.sku).toBe("S5");
    expect(sheet.totalRows).toBe(12);
    expect(sheet.truncated).toBe(true);
    expect(find(sheet.issues, "sheet.truncated")).toMatchObject({ severity: "warn", message: "Rows 6 and beyond were not imported", ec: "A14" });
  });

  it("EC-A16: CREATE TABLE without any INSERT behaves like a header-only sheet", () => {
    const sheet = parseSqlDump("CREATE TABLE `products` (`sku` varchar(32), `name` text, PRIMARY KEY (`sku`));", { maxRows: 100 });
    expect(sheet.headers).toEqual(["sku", "name"]);
    expect(sheet.rows).toEqual([]);
    expect(sheet.sheetName).toBe("products");
    expect(find(sheet.issues, "sheet.no_data_rows")).toMatchObject({ severity: "info", ec: "A16" });
    expect(codes(sheet.issues)).not.toContain("sql.no_rows");
  });
});

describe("parseSqlDump: COPY blocks (EC-A20)", () => {
  it("EC-A20: pg_dump COPY … FROM stdin with \\N, tab escapes and the \\. terminator", () => {
    const sheet = parseSqlDump(COPY, { maxRows: 100 });
    expect(sheet.sheetName).toBe("products");
    expect(sheet.headers).toEqual(["id", "sku", "name", "price"]);
    expect(sheet.rows.map((r) => r.cells)).toEqual([
      { id: "1", sku: "A1", name: "Vase", price: "12.50" },
      { id: "2", sku: "A2", name: "", price: "8" },
      { id: "3", sku: "A3", name: "Tab\there \\ back", price: "-2.5" },
    ]);
    expect(find(sheet.issues, "sql.tables_ignored")?.value).toBe("categories");
  });

  it("EC-A20: a COPY block without a column list uses the CREATE TABLE columns, and CRLF data lines are fine", () => {
    const text = "CREATE TABLE t (\r\n  sku text,\r\n  qty integer\r\n);\r\nCOPY t FROM stdin;\r\nA1\t4\r\nA2\t\\N\r\n\\.\r\n";
    const sheet = parseSqlDump(text, { maxRows: 100 });
    expect(sheet.headers).toEqual(["sku", "qty"]);
    expect(sheet.rows.map((r) => r.cells)).toEqual([
      { sku: "A1", qty: "4" },
      { sku: "A2", qty: "" },
    ]);
  });

  it("EC-A20: a COPY block that never closes is used to the end of the file with a warning", () => {
    const sheet = parseSqlDump("COPY t (sku) FROM stdin;\nA1\nA2\n", { maxRows: 100 });
    expect(sheet.rows.map((r) => r.cells.sku)).toEqual(["A1", "A2"]);
    expect(find(sheet.issues, "sql.copy_unterminated")?.severity).toBe("warn");
  });

  it("EC-A20: COPY in CSV format is refused with a clear message instead of garbage rows", () => {
    const sheet = parseSqlDump("COPY t (sku, name) FROM stdin WITH (FORMAT csv);\nA1,Vase\n\\.\n", { maxRows: 100 });
    expect(sheet.rows).toEqual([]);
    expect(find(sheet.issues, "sql.copy_csv")?.severity).toBe("warn");
  });
});

describe("parseSqlDump: several tables and non-INSERT statements (EC-A21, EC-A22)", () => {
  it("EC-A21: the table with the most rows wins and the others are named", () => {
    const text = [
      "INSERT INTO categories (id, name) VALUES (1, 'Decor'), (2, 'Kitchen');",
      "INSERT INTO products (sku, name) VALUES ('A1', 'Vase'), ('A2', 'Bowl'), ('A3', 'Pot');",
      "INSERT INTO suppliers (id) VALUES (1);",
    ].join("\n");
    const sheet = parseSqlDump(text, { maxRows: 100 });
    expect(sheet.sheetName).toBe("products");
    expect(sheet.rows).toHaveLength(3);
    const ignored = find(sheet.issues, "sql.tables_ignored");
    expect(ignored).toMatchObject({ severity: "info", ec: "A21", value: "categories, suppliers" });
    expect(ignored?.message).toContain('"categories" (2 rows)');
  });

  it("EC-A22: a hostile dump with DROP TABLE yields the INSERT rows and an info issue; nothing is executed", () => {
    const text = [
      "DROP TABLE products;",
      "DROP DATABASE shop;",
      "SET NAMES utf8mb4;",
      "INSERT INTO products (sku, name) VALUES ('A1', 'Vase');",
      "DELETE FROM products WHERE 1=1;",
      "INSERT INTO products (sku, name) VALUES ('A2', 'Bowl');",
    ].join("\n");
    const sheet = parseSqlDump(text, { maxRows: 100 });
    expect(sheet.rows.map((r) => r.cells.sku)).toEqual(["A1", "A2"]);
    const ignored = find(sheet.issues, "sql.statements_ignored");
    expect(ignored).toMatchObject({ severity: "info", ec: "A22" });
    expect(ignored?.message).toMatch(/^4 statements that do not insert rows were ignored \(DROP TABLE, DROP DATABASE, SET, DELETE FROM\)/);
    expect(sheet.issues.some((i) => i.severity === "error")).toBe(false);
  });

  it("EC-A22: mysqldump and pg_dump boilerplate is skipped silently or counted, never parsed as rows", () => {
    const mysql = parseSqlDump(MYSQL, { maxRows: 100 });
    expect(find(mysql.issues, "sql.statements_ignored")?.value).toBe("DROP TABLE, LOCK TABLES, UNLOCK TABLES");
    const pg = parseSqlDump(POSTGRES, { maxRows: 100 });
    expect(find(pg.issues, "sql.statements_ignored")?.value).toBe("SET, SELECT, ALTER TABLE");
    const copy = parseSqlDump(COPY, { maxRows: 100 });
    expect(find(copy.issues, "sql.statements_ignored")?.value).toBe("\\restrict, SELECT");
  });
});

describe("parseSqlDump: junk never throws", () => {
  const junk: Array<[string, string]> = [
    ["plain prose", "Hello, this is not SQL at all. Just some text; with punctuation."],
    ["empty text", ""],
    ["only comments", "-- nothing here\n/* still nothing */"],
    ["unterminated string", "INSERT INTO p (sku) VALUES ('A1"],
    ["unbalanced parentheses", "INSERT INTO p (sku VALUES ('A1');"],
    ["INSERT … SELECT", "INSERT INTO p (sku) SELECT sku FROM q;"],
    ["binary-looking text", "\u0000\u0001\u0002 INSERT INTO ((( ;;; )))"],
    ["a bare semicolon storm", ";;;;;;"],
  ];

  it.each(junk)("%s → zero rows and an error issue", (_name, text) => {
    const sheet = parseSqlDump(text, { maxRows: 100 });
    expect(sheet.rows).toEqual([]);
    expect(sheet.headers).toEqual([]);
    expect(find(sheet.issues, "sql.no_rows")).toMatchObject({ severity: "error", ec: "A20" });
  });

  it("a broken statement is skipped and the good ones still count", () => {
    const text = "INSERT INTO p (sku) VALUES ('A1');\nINSERT INTO p (sku) VALUES ('A2' 'oops');\nINSERT INTO p (sku) VALUES ('A3');";
    const sheet = parseSqlDump(text, { maxRows: 100 });
    expect(sheet.rows.map((r) => r.cells.sku)).toEqual(["A1", "A3"]);
    expect(find(sheet.issues, "sql.syntax")?.severity).toBe("warn");
  });
});

describe("looksLikeSqlDump and parseSheet routing", () => {
  const detection: Array<[string, string, string | undefined, boolean]> = [
    ["CREATE TABLE after comments", "-- x\n\n/* y */ CREATE TABLE t (a int);", undefined, true],
    ["INSERT INTO", "INSERT INTO t VALUES (1);", undefined, true],
    ["COPY … FROM stdin", "COPY public.t (a, b) FROM stdin;\n1\t2\n\\.", undefined, true],
    ["pg_dump header starting with SET", "SET statement_timeout = 0;\nSET lock_timeout = 0;", undefined, true],
    ["mysqldump conditional comments then DROP TABLE", "/*!40101 SET NAMES utf8 */;\nDROP TABLE IF EXISTS `t`;", undefined, true],
    ["a .sql extension regardless of content", "sku,name\nA1,Vase", "export.sql", true],
    ["a plain CSV", "sku,name,price\nA1,Vase,12.50", "export.csv", false],
    ["a CSV whose first header is Set", "Set,Price\nA,1", undefined, false],
    ["a CSV whose first header is Insert date", "Insert date,Price\n2024,1", undefined, false],
  ];

  it.each(detection)("%s → %s", (_name, text, filename, expected) => {
    expect(looksLikeSqlDump(text, filename)).toBe(expected);
  });

  it("EC-A20: parseSheet reads a .sql upload through the dump parser with the table as sheet name", () => {
    const sheet = parseSheet(Buffer.from(MYSQL, "utf8"), { filename: "dump.sql", maxRows: 100 });
    expect(sheet.format).toBe("sql");
    expect(sheet.encoding).toBe("utf-8");
    expect(sheet.sheetName).toBe("products");
    expect(sheet.headers).toEqual(["id", "sku", "name", "price", "stock"]);
    expect(sheet.rows).toHaveLength(3);
    expect(sheet.rows[1].cells.name).toBe("O'Brien's 'favourite'");
    expect(find(sheet.issues, "sql.table_used")).toBeDefined();
    expect(codes(sheet.issues)).not.toContain("sheet.no_header");
  });

  it("EC-A20: a dump saved with a .csv extension is still recognised by its statements", () => {
    const sheet = parseSheet(Buffer.from(POSTGRES, "utf8"), { filename: "products.csv", maxRows: 100 });
    expect(sheet.sheetName).toBe("products");
    expect(sheet.rows).toHaveLength(3);
  });

  it("EC-A13: Excel-style accidents in dump cells are flagged like CSV cells", () => {
    const text = "INSERT INTO products (sku, name) VALUES ('1E5', 'Vase'), ('01/02/2024', 'Bowl');";
    const sheet = parseSheet(Buffer.from(text, "utf8"), { filename: "dump.sql", maxRows: 100 });
    expect(find(sheet.issues, "cell.scientific_notation")).toMatchObject({ field: "sku", row: 1 });
    expect(find(sheet.issues, "cell.date_like")).toMatchObject({ field: "sku", row: 2 });
  });

  it("EC-A14: parseSheet passes its row cap to the dump parser", () => {
    const tuples = Array.from({ length: 30 }, (_, i) => `(${i + 1})`).join(",");
    const sheet = parseSheet(Buffer.from(`INSERT INTO p (id) VALUES ${tuples};`), { filename: "dump.sql", maxRows: 20 });
    expect(sheet.rows).toHaveLength(20);
    expect(sheet.totalRows).toBe(30);
    expect(sheet.truncated).toBe(true);
  });

  it("a .sql file with no statements fails with the dump error, not 'no header row'", () => {
    const sheet = parseSheet(Buffer.from("just notes\n"), { filename: "notes.sql", maxRows: 100 });
    expect(sheet.rows).toEqual([]);
    expect(find(sheet.issues, "sql.no_rows")?.severity).toBe("error");
  });
});

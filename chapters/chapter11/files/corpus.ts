/**
 * The corpus: forty notes in four subjects, and eight questions phrased the way a person would ask
 * them rather than the way a keyword index needs them.
 *
 * The notes are data and not a fixture from the model. The vectors in `embeddings.json` are the
 * model's output over these texts, and the labels in `topic` are what makes a search measurable:
 * a top-five that returns notes from the query's subject is a good search, whatever it scored.
 */

export const TOPICS = ["storage", "wasm", "ui", "db"] as const;
export type Topic = (typeof TOPICS)[number];

export type Note = {
  readonly id: string;
  readonly topic: Topic;
  readonly text: string;
};

export type Query = {
  readonly id: string;
  readonly topic: Topic;
  readonly text: string;
};

export const NOTES: readonly Note[] = [
  // storage
  { id: "s1", topic: "storage", text: "The origin private file system gives a page a private directory it can read and write without asking the user for anything." },
  { id: "s2", topic: "storage", text: "IndexedDB keeps structured records in the browser and survives a reload, a crash and a closed laptop." },
  { id: "s3", topic: "storage", text: "A file handle from the picker can be stored and reopened on the next visit, if the user grants permission again." },
  { id: "s4", topic: "storage", text: "Local-first software treats the copy on the device as the real one and the network as an optional synchroniser." },
  { id: "s5", topic: "storage", text: "The quota manager reports how many bytes the origin may use before the browser starts evicting." },
  { id: "s6", topic: "storage", text: "Clearing site data in the settings menu deletes everything the origin stored, including the database." },
  { id: "s7", topic: "storage", text: "A service worker can serve the interface from a cache when the connection is gone." },
  { id: "s8", topic: "storage", text: "The storage bucket API lets a page ask for a durable allocation that is not evicted under pressure." },
  { id: "s9", topic: "storage", text: "Moving a photo into the tab means it never goes over a network, and the backup becomes the user's job." },
  { id: "s10", topic: "storage", text: "A folder on disk can be mounted into the page, and the page sees ordinary files it can slice." },

  // wasm
  { id: "w1", topic: "wasm", text: "WebAssembly is a compact binary instruction set that the browser compiles ahead of time and runs at near-native speed." },
  { id: "w2", topic: "wasm", text: "Emscripten takes a C or C++ project and produces a wasm module, a JavaScript glue file and a virtual file system." },
  { id: "w3", topic: "wasm", text: "The first instantiation of a large module costs more than every call that follows, because the engine validates and compiles it." },
  { id: "w4", topic: "wasm", text: "A wasm module cannot touch the network or the disk directly; every side effect goes through an imported function." },
  { id: "w5", topic: "wasm", text: "SIMD instructions process several numbers per operation, and a build without them runs the same code more slowly." },
  { id: "w6", topic: "wasm", text: "Threads in wasm need shared memory, and shared memory needs two HTTP headers that isolate the page." },
  { id: "w7", topic: "wasm", text: "The binary is cached by the browser after the first download, so the second visit pays the compile and not the transfer." },
  { id: "w8", topic: "wasm", text: "A wasm build of a database keeps its pages in a heap the page cannot see, and the file system is a shim over memory." },
  { id: "w9", topic: "wasm", text: "FFmpeg compiled to wasm is thirty megabytes and transcodes a video without a server." },
  { id: "w10", topic: "wasm", text: "The module's memory grows in pages, and a large allocation can fail even when the machine has gigabytes free." },

  // ui
  { id: "u1", topic: "ui", text: "A virtual list renders only the rows on screen and recycles them as the user scrolls." },
  { id: "u2", topic: "ui", text: "Layout thrashing happens when a loop reads a measurement after writing one, forcing the browser to recalculate." },
  { id: "u3", topic: "ui", text: "A long task blocks the main thread, and the frame that should have painted waits behind it." },
  { id: "u4", topic: "ui", text: "Requesting an animation frame is the right place to write styles, because it runs before the next paint." },
  { id: "u5", topic: "ui", text: "Skeleton screens make a wait feel shorter by showing the shape of the content that is coming." },
  { id: "u6", topic: "ui", text: "A web worker runs JavaScript off the main thread, so a heavy computation does not freeze the interface." },
  { id: "u7", topic: "ui", text: "Passive event listeners tell the browser the handler will not cancel the scroll, so scrolling can start immediately." },
  { id: "u8", topic: "ui", text: "Images without explicit dimensions shift the layout when they load, and the shift is measurable." },
  { id: "u9", topic: "ui", text: "A text field that debounces its input waits for the typing to pause before it does the expensive work." },
  { id: "u10", topic: "ui", text: "Rendering ten thousand rows as DOM nodes costs more memory than rendering the forty that fit." },

  // db
  { id: "d1", topic: "db", text: "Postgres compiled to WebAssembly runs in the tab with real transactions and a query planner." },
  { id: "d2", topic: "db", text: "SQLite stores a whole database in one file and needs no server process to answer a query." },
  { id: "d3", topic: "db", text: "A migration is a numbered step applied once, and the version table is what makes a retry safe." },
  { id: "d4", topic: "db", text: "An index on a column with two distinct values costs more to maintain than the scan it replaces." },
  { id: "d5", topic: "db", text: "A group by builds a hash table of the distinct keys and accumulates one row per key." },
  { id: "d6", topic: "db", text: "A columnar file stores each field contiguously, so a query that needs two columns reads only those." },
  { id: "d7", topic: "db", text: "Parquet carries its schema in a footer, which lets a reader refuse a missing column before reading data." },
  { id: "d8", topic: "db", text: "A transaction either commits every statement or none, and the guarantee is what a page needs when it can be closed at any moment." },
  { id: "d9", topic: "db", text: "Query parameters are bound, never interpolated, because a string in a where clause is a second program." },
  { id: "d10", topic: "db", text: "DuckDB scans a million rows in the browser in tens of milliseconds because it never builds an object per row." },
];

/**
 * Eight questions, each about one subject, written without the words the notes use.
 *
 * This is the point of the chapter: a person who remembers the idea does not remember the identifier,
 * and a keyword index only knows the identifier.
 */
export const QUERIES: readonly Query[] = [
  { id: "q1", topic: "storage", text: "where do my files go when I close the tab" },
  { id: "q2", topic: "wasm", text: "run a big C program inside the page" },
  { id: "q3", topic: "ui", text: "keep a huge list scrolling without stutter" },
  { id: "q4", topic: "db", text: "ask questions about data with no backend" },
  { id: "q5", topic: "wasm", text: "why is a large module slow the first time it runs" },
  { id: "q6", topic: "storage", text: "store pictures on the device and skip the upload" },
  { id: "q7", topic: "ui", text: "make a slow computation stop freezing the screen" },
  { id: "q8", topic: "storage", text: "what happens to my app when the internet drops" },
];

/** Words that carry no signal in a keyword search, and would make the baseline look better than it is. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how", "i",
  "in", "is", "it", "my", "no", "not", "of", "on", "or", "so", "that", "the", "their", "them",
  "then", "there", "these", "they", "this", "to", "was", "what", "when", "where", "which", "why",
  "with", "without", "you", "your",
]);

export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/**
 * The keyword baseline: how many of the query's content words appear in the note.
 *
 * Substring matching and not stemming, which is what a `like '%word%'` in a page actually does. It is
 * deliberately simple: a sophisticated baseline is a second system to defend, and the claim is only
 * that meaning beats words.
 */
export function keywordScore(text: string, query: string): number {
  const haystack = text.toLowerCase();
  return contentWords(query).filter((word) => haystack.includes(word)).length;
}

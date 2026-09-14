// Minimal ambient type declarations for libraries without published types.
declare module 'cli-table3' {
  interface TableOptions {
    head?: string[];
    style?: { head?: string[]; border?: string[]; 'padding-left'?: number; 'padding-right'?: number };
    colWidths?: number[];
    colAligns?: string[];
    wordWrap?: boolean;
  }
  interface TableInstance {
    push(row: unknown[] | Record<string, unknown>): void;
    toString(): string;
  }
  interface TableConstructor {
    new (options?: TableOptions): TableInstance;
  }
  const Table: TableConstructor;
  export default Table;
}

declare module 'pdf-parse' {
  interface PdfData {
    text: string;
    numpages: number;
    info: {
      Title?: string;
      Author?: string;
      Subject?: string;
      Producer?: string;
      CreationDate?: string;
      [key: string]: unknown;
    };
  }
  function pdfParse(data: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfData>;
  export default pdfParse;
}
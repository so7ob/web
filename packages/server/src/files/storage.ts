import { constants } from "node:fs";
import { mkdir, lstat, realpath, open, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { validateUpload } from "./upload-validation.js";
export interface StoredUpload {
  storedName: string;
  mimeType: string;
  size: number;
  filename: string;
}
export class FileStore {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}
  private async root() {
    const configured = this.env.DATA_DIR;
    if (!configured || !isAbsolute(configured))
      throw new Error("An independent absolute DATA_DIR is required");
    await mkdir(configured, { recursive: true, mode: 0o700 });
    const data = await realpath(configured);
    const root = await realpath(process.cwd());
    const inside = relative(root, data);
    if (
      this.env.NODE_ENV === "production" &&
      (inside === "" ||
        (!inside.startsWith(".." + sep) &&
          inside !== ".." &&
          !isAbsolute(inside)))
    )
      throw new Error("Production DATA_DIR must be outside the release");
    const directory = join(data, "uploads");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Uploads must be a real private directory");
    return directory;
  }
  private safe(name: string) {
    return (
      !!name &&
      basename(name) === name &&
      !name.includes("\\") &&
      !name.includes("\0") &&
      name !== "." &&
      name !== ".."
    );
  }
  async store(
    file: File,
    kind: "attachment" | "media",
  ): Promise<StoredUpload | { error: string }> {
    const checked = await validateUpload(file, kind);
    if ("error" in checked) return { error: checked.error! };
    const root = await this.root();
    const storedName =
      Date.now().toString(36) +
      "-" +
      randomBytes(16).toString("hex") +
      checked.extension;
    const handle = await open(
      join(root, storedName),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(checked.buffer);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await unlink(join(root, storedName)).catch(() => {});
      throw error;
    }
    await handle.close();
    return {
      storedName,
      mimeType: checked.mimeType,
      size: file.size,
      filename:
        file.name.replace(/[^\w\s.\-()\u0600-\u06FF]/g, "_").slice(0, 120) ||
        "file",
    };
  }
  async read(storedName: string) {
    if (!this.safe(storedName)) return null;
    const root = await this.root();
    try {
      const file = await open(
        join(root, storedName),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      let stat;
      try {
        stat = await file.stat();
      } catch (error) {
        await file.close();
        throw error;
      }
      if (!stat.isFile()) {
        await file.close();
        return null;
      }
      return {
        size: stat.size,
        stream: () => file.createReadStream(),
        close: () => file.close(),
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["ENOENT", "ELOOP", "ENOTDIR"].includes(String(error.code))
      )
        return null;
      throw error;
    }
  }
  async remove(storedName: string): Promise<void> {
    if (!this.safe(storedName)) throw new Error("Invalid stored filename");
    const root = await this.root();
    try {
      const stat = await lstat(join(root, storedName));
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("Refuse to delete a non-regular stored file");
      await unlink(join(root, storedName));
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
        return;
      throw error;
    }
  }
}

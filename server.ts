import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // API to resolve short Google Maps links
  app.post("/api/resolve-maps-link", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      // Follow redirects to get the final URL which contains coordinates
      // Adding a User-Agent helps avoid being blocked by some services
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        redirect: "follow",
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      const finalUrl = response.url;
      console.log(`Resolved ${url} to ${finalUrl}`);
      
      // If the redirected URL doesn't have coordinates, try looking into the HTML body
      // This helps with some "preview" or search results pages
      if (!finalUrl.includes('!') && !finalUrl.includes('@') && !finalUrl.includes('q=')) {
        const html = await response.text();
        // Look for common patterns in scripts or meta tags
        // Example: [null,null,23.0225,72.5714] or similar
        const bodyPatterns = [
          /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
          /\[(-?\d+\.\d+),(-?\d+\.\d+)\]/,
          /center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/,
          /\"lat\":(-?\d+\.\d+),\"lng\":(-?\d+\.\d+)/
        ];
        
        for (const pattern of bodyPatterns) {
          const match = html.match(pattern);
          if (match) {
            console.log("Found coordinates in body HTML");
            // If found in body, we can append them to the final URL for the frontend to find
            return res.json({ finalUrl: `${finalUrl}#q=${match[1]},${match[2]}` });
          }
        }
      }

      res.json({ finalUrl });
    } catch (error) {
      console.error("Error resolving link:", error);
      res.status(500).json({ error: "Failed to resolve link" });
    }
  });

  // Vite middleware setup (see next step)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const portNum = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;

  app.listen(portNum, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${portNum}`);
  });
}

startServer();

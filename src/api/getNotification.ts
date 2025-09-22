import express, { Request, Response } from "express";
import bodyParser from "body-parser";


const app = express();
app.use(bodyParser.json());
const targetPageId = 1687519372;

// Webhook endpoint
app.post("/confluence-webhook", async (req: Request, res: Response) => {
  try {
    const event = req.body;

    console.log(">>> Webhook event received:", JSON.stringify(event, null, 2));

    if (event.event === "page_updated" && event.page?.id === targetPageId) {
        console.log(`>>> Target page updated! ID: ${event.page.id}`);
      } else {
        console.log(">>> Ignored event (not the target page).");
      }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handling failed:", err);
    res.status(500).send("Internal Server Error");
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on http://localhost:${PORT}`);
});

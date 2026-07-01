import { app } from "./app.js";

const port = Number(process.env.SERVER_PORT || process.env.PORT || 8787);

app.listen(port, "0.0.0.0", () => {
  console.log(`API server listening on http://localhost:${port}`);
});

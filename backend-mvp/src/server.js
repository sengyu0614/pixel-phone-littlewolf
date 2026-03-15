import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp(config);

app.listen(config.port, () => {
  console.log(`pixel-backend-mvp running on http://localhost:${config.port}`);
});

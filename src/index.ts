"use strict";
import app from "./app";

if (module === require.main) {
  const port = process.env.PORT || app.PORT;

  app.server.listen(port, () => {
    // tslint:disable-next-line: no-console
    console.log(`server running in http://localhost:${port}`);
  });
}

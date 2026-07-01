const { createHash } = require("node:crypto");

exports.handler = (event, _context, callback) => {
  const request = event.Records[0].cf.request;
  const body = request.body;

  if (body?.data) {
    const encoding = body.encoding === "base64" ? "base64" : "utf8";
    const payload = Buffer.from(body.data, encoding);
    const hash = createHash("sha256").update(payload).digest("hex");

    request.headers["x-amz-content-sha256"] = [{
      key: "x-amz-content-sha256",
      value: hash,
    }];
  }

  callback(null, request);
};

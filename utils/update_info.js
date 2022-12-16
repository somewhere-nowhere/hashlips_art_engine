const basePath = process.cwd();
const fs = require("fs");

const { baseUri } = require(`${basePath}/src/config.js`);

// read json data
let rawdata = fs.readFileSync(`${basePath}/build/json/_metadata.json`);
let data = JSON.parse(rawdata);

data.forEach((item, index) => {
  const edition = index + 1;
  item.image = `${baseUri}/${edition}.png`;
  fs.writeFileSync(
    `${basePath}/build/json/${edition}.json`,
    `${JSON.stringify({ ...item, edition: undefined }, null, 2)}\n`
  );
});

fs.writeFileSync(
  `${basePath}/build/json/_metadata.json`,
  `${JSON.stringify(data, null, 2)}\n`
);

console.log(`Updated baseUri for images to ===> ${baseUri}`);

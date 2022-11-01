const basePath = process.cwd();
const fs = require("fs");

const {
  baseExternalUrl,
  baseUri,
  description,
  namePrefix,
} = require(`${basePath}/src/config.js`);

// read json data
let rawdata = fs.readFileSync(`${basePath}/build/json/_metadata.json`);
let data = JSON.parse(rawdata);

data.forEach((item, index) => {
  const edition = index + 1;
  item.name = `${namePrefix} #${edition}`;
  item.description = description;
  item.image = `${baseUri}/${edition}.png`;
  item.external_url = `${baseExternalUrl}/${edition}.png`;
  fs.writeFileSync(
    `${basePath}/build/json/${edition}.json`,
    JSON.stringify(item, null, 2)
  );
});

fs.writeFileSync(
  `${basePath}/build/json/_metadata.json`,
  JSON.stringify(data, null, 2)
);

console.log(`Updated baseUri for images to ===> ${baseUri}`);
console.log(`Updated description for images to ===> ${description}`);
console.log(`Updated name prefix for images to ===> ${namePrefix}`);

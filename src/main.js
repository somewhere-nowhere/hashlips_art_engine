const basePath = process.cwd();
const { ethers } = require("ethers");
const fs = require("fs");
const { externalUrl } = require("./config");
const sha1 = require(`${basePath}/node_modules/sha1`);
const { createCanvas, loadImage } = require(`${basePath}/node_modules/canvas`);
const buildDir = `${basePath}/build`;
const layersDir = `${basePath}/layers`;
const {
  format,
  description,
  baseUri,
  baseExternalUrl,
  background,
  uniqueDnaTorrance,
  layerConfigurations,
  rarityDelimiter,
  shuffleLayerConfigurations,
  debugLogs,
  extraMetadata,
  text,
  namePrefix,
  gif,
} = require(`${basePath}/src/config.js`);
const canvas = createCanvas(format.width, format.height);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = format.smoothing;
var metadataList = [];
var attributesList = [];
var dnaList = new Set();
const ATTRIBUTE_SALT = ethers.utils.id("Somewhere Nowhere");
const DNA_DELIMITER = "-";
const HashlipsGiffer = require(`${basePath}/modules/HashlipsGiffer.js`);

let hashlipsGiffer = null;

const buildSetup = () => {
  if (fs.existsSync(buildDir)) {
    fs.rmdirSync(buildDir, { recursive: true });
  }
  fs.mkdirSync(buildDir);
  fs.mkdirSync(`${buildDir}/json`);
  fs.mkdirSync(`${buildDir}/images`);
  if (gif.export) {
    fs.mkdirSync(`${buildDir}/gifs`);
  }
};

const getRarityWeight = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = Number(
    nameWithoutExtension.split(rarityDelimiter).pop()
  );
  if (isNaN(nameWithoutWeight)) {
    nameWithoutWeight = 1;
  }
  return nameWithoutWeight;
};

const cleanDna = (_str) => {
  const withoutOptions = removeQueryStrings(_str);
  var dna = Number(withoutOptions.split(":").shift());
  return dna;
};

const cleanName = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = nameWithoutExtension.split(rarityDelimiter).shift();
  return nameWithoutWeight;
};

const getElements = (path) => {
  return fs
    .readdirSync(path)
    .filter((item) => !/(^|\/)\.[^\/\.]/g.test(item))
    .map((i, index) => {
      if (i.includes("-")) {
        throw new Error(`layer name can not contain dashes, please fix: ${i}`);
      }
      return {
        id: index,
        name: cleanName(i),
        filename: i,
        path: `${path}${i}`,
        weight: getRarityWeight(i),
      };
    });
};

const layersSetup = (layersOrder) => {
  let layers = layersOrder.map((layerObj, index) => ({
    id: index,
    elements: getElements(`${layersDir}/${layerObj.name}/`),
    name:
      layerObj.options?.["displayName"] != undefined
        ? layerObj.options?.["displayName"]
        : layerObj.name,
    blend:
      layerObj.options?.["blend"] != undefined
        ? layerObj.options?.["blend"]
        : "source-over",
    opacity:
      layerObj.options?.["opacity"] != undefined
        ? layerObj.options?.["opacity"]
        : 1,
    useIndex: (() => {
      for (let i = 0; i < layersOrder.length; ++i) {
        if (layersOrder[i].name == layerObj.use) {
          return i;
        }
      }
      return -1;
    })(),
  }));
  layers = layers.map((layer, index) => {
    if (layer.useIndex >= 0) {
      let otherLayer = layers[layer.useIndex];
      return {
        ...layer,
        elements: otherLayer.elements.map((element, index) => {
          for (let i = 0; i < layer.elements.length; ++i) {
            if (layer.elements[i].name == element.name) {
              return {
                ...element,
                filename: layer.elements[i].filename,
                path: layer.elements[i].path,
              };
            }
          }
          return {
            ...element,
            filename: undefined,
            path: undefined,
          };
        }),
      };
    } else {
      return layer;
    }
  });
  return layers;
};

const saveImage = (_editionCount) => {
  fs.writeFileSync(
    `${buildDir}/images/${_editionCount}.png`,
    canvas.toBuffer("image/png")
  );
};

const genColor = () => {
  let hue = Math.floor(Math.random() * 360);
  let pastel = `hsl(${hue}, 100%, ${background.brightness})`;
  return pastel;
};

const drawBackground = () => {
  ctx.fillStyle = background.static ? background.default : genColor();
  ctx.fillRect(0, 0, format.width, format.height);
};

const addMetadata = (_dna, _edition) => {
  let dateTime = Date.now();
  let tempMetadata = {
    edition: _edition,
    image: `${baseUri}/${_edition}.png`,
    ...extraMetadata,
    attributes: attributesList,
  };
  metadataList.push(tempMetadata);
  attributesList = [];
};

const addAttributes = (_element) => {
  let selectedElement = _element.layer.selectedElement;
  attributesList.push({
    trait_type: _element.layer.name,
    value: selectedElement.name,
  });
};

const loadLayerImg = async (_layer) => {
  if (_layer.selectedElement.path === undefined) {
    return { layer: _layer, loadedImage: undefined };
  }
  try {
    return new Promise(async (resolve) => {
      const image = await loadImage(`${_layer.selectedElement.path}`);
      resolve({ layer: _layer, loadedImage: image });
    });
  } catch (error) {
    console.error("Error loading image:", error);
  }
};

const addText = (_sig, x, y, size) => {
  ctx.fillStyle = text.color;
  ctx.font = `${text.weight} ${size}pt ${text.family}`;
  ctx.textBaseline = text.baseline;
  ctx.textAlign = text.align;
  ctx.fillText(_sig, x, y);
};

const drawElement = (_renderObject, _index) => {
  ctx.globalAlpha = _renderObject.layer.opacity;
  ctx.globalCompositeOperation = _renderObject.layer.blend;
  if (_renderObject.loadedImage !== undefined) {
    text.only
      ? addText(
          `${_renderObject.layer.name}${text.spacer}${_renderObject.layer.selectedElement.name}`,
          text.xGap,
          text.yGap * (_index + 1),
          text.size
        )
      : ctx.drawImage(
          _renderObject.loadedImage,
          0,
          0,
          format.width,
          format.height
        );
  }
  if (_renderObject.layer.useIndex < 0) {
    addAttributes(_renderObject);
  }
};

const constructLayerToDna = (_dna = "", _layers = []) => {
  let mappedDnaToLayers = _layers.map((layer, index) => {
    let selectedElement = layer.elements.find(
      (e) => e.id == cleanDna(_dna.split(DNA_DELIMITER)[index])
    );
    return {
      name: layer.name,
      blend: layer.blend,
      opacity: layer.opacity,
      useIndex: layer.useIndex,
      selectedElement: selectedElement,
    };
  });
  return mappedDnaToLayers;
};

/**
 * Cleaning function for DNA strings. When DNA strings include an option, it
 * is added to the filename with a ?setting=value query string. It needs to be
 * removed to properly access the file name before Drawing.
 *
 * @param {String} _dna The entire newDNA string
 * @returns Cleaned DNA string without querystring parameters.
 */
const removeQueryStrings = (_dna) => {
  const query = /(\?.*$)/;
  return _dna.replace(query, "");
};

const createDna = (_layers, tokenId) => {
  let hash = ethers.utils.solidityKeccak256(
    ["uint256", "uint256"],
    [tokenId, ATTRIBUTE_SALT]
  );
  let randNum = [];
  _layers.forEach((layer, index) => {
    if (layer.useIndex >= 0) {
      index = layer.useIndex;
    }
    let totalWeight = 0;
    layer.elements.forEach((element) => {
      totalWeight += element.weight;
    });
    let x = ethers.BigNumber.from(hash)
      .div(
        ethers.BigNumber.from("0x10000000000000000").pow(
          ethers.BigNumber.from(index)
        )
      )
      .mod(ethers.BigNumber.from(totalWeight))
      .toNumber();
    let sum = 0;
    for (let i = 0; i < layer.elements.length; ++i) {
      let weight = layer.elements[i].weight;
      if (x >= sum && x < sum + weight) {
        return randNum.push(
          `${layer.elements[i].id}:${layer.elements[i].filename}`
        );
      }
      sum += weight;
    }
  });
  return {
    hash: hash,
    dna: randNum.join(DNA_DELIMITER),
  };
};

const writeMetaData = (_data) => {
  fs.writeFileSync(`${buildDir}/json/_metadata.json`, _data);
};

const saveMetaDataSingleFile = (_editionCount) => {
  let metadata = metadataList.find((meta) => meta.edition == _editionCount);
  delete metadata.edition;
  debugLogs
    ? console.log(
        `Writing metadata for ${_editionCount}: ${JSON.stringify(metadata)}`
      )
    : null;
  fs.writeFileSync(
    `${buildDir}/json/${_editionCount}.json`,
    `${JSON.stringify(metadata, null, 2)}\n`
  );
};

function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

const startCreating = async () => {
  let layerConfigIndex = 0;
  let editionCount = 1;
  let failedCount = 0;
  let abstractedIndexes = [];
  for (
    let i = 1;
    i <= layerConfigurations[layerConfigurations.length - 1].growEditionSizeTo;
    i++
  ) {
    abstractedIndexes.push(i);
  }
  if (shuffleLayerConfigurations) {
    abstractedIndexes = shuffle(abstractedIndexes);
  }
  debugLogs
    ? console.log("Editions left to create: ", abstractedIndexes)
    : null;
  while (layerConfigIndex < layerConfigurations.length) {
    const layers = layersSetup(
      layerConfigurations[layerConfigIndex].layersOrder
    );
    while (
      editionCount <= layerConfigurations[layerConfigIndex].growEditionSizeTo
    ) {
      let { hash, dna } = createDna(layers, abstractedIndexes[0]);
      let results = constructLayerToDna(dna, layers);
      let loadedElements = [];

      results.forEach((layer) => {
        loadedElements.push(loadLayerImg(layer));
      });

      await Promise.all(loadedElements).then((renderObjectArray) => {
        debugLogs ? console.log("Clearing canvas") : null;
        ctx.clearRect(0, 0, format.width, format.height);
        if (gif.export) {
          hashlipsGiffer = new HashlipsGiffer(
            canvas,
            ctx,
            `${buildDir}/gifs/${abstractedIndexes[0]}.gif`,
            gif.repeat,
            gif.quality,
            gif.delay
          );
          hashlipsGiffer.start();
        }
        if (background.generate) {
          drawBackground();
        }
        renderObjectArray.forEach((renderObject, index) => {
          drawElement(renderObject, index);
          if (gif.export) {
            hashlipsGiffer.add();
          }
        });
        if (gif.export) {
          hashlipsGiffer.stop();
        }
        debugLogs
          ? console.log("Editions left to create: ", abstractedIndexes)
          : null;
        saveImage(abstractedIndexes[0]);
        addMetadata(dna, abstractedIndexes[0]);
        saveMetaDataSingleFile(abstractedIndexes[0]);

        console.log(hash);
        console.log(dna.split(DNA_DELIMITER));
        console.log(`Created edition: ${abstractedIndexes[0]}\n`);
      });
      editionCount++;
      abstractedIndexes.shift();
    }
    layerConfigIndex++;
  }
  writeMetaData(JSON.stringify(metadataList, null, 2));
};

module.exports = { startCreating, buildSetup, getElements };

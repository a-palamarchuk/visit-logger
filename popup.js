const fileInputElement = document.getElementById("fileInput");
fileInputElement.addEventListener("change", handlePicked);

const submitElement = document.getElementById("submit");
submitElement.addEventListener("click", handleSubmitted);

let importedSitesToLoad = null;

function handlePicked() {
  const file = this.files[0];
  console.log("Importing");
  console.log(file);
  const reader = new FileReader();
  reader.addEventListener("load", () => parseLoggedSites(reader.result), false);
  reader.readAsText(file);
}

function parseLoggedSites(json) {
  const content = document.querySelector(".content");

  try {
    const imported = JSON.parse(json);
    const importedSites = new Set(Object.keys(imported));
    browser.storage.local.get()
      .then((storage) => {
        const storedSites = new Set(Object.keys(storage));
        const existingSites = importedSites.intersection(storedSites);
        for (site of existingSites) {
          delete imported[site];
        }
        importedSitesToLoad = imported;

        const newSites = importedSites.difference(storedSites);

        let message = `Visit Logger already has ${storedSites.size} records\n`
            + `Successfully read ${importedSites.size} records from the file`
            + `, ${existingSites.size} of which are already in storage and will be skipped\n\n`
            + `${newSites.size} new records will be loaded:\n`;
        const sortedNewSites = Array.from(newSites).sort();
        for (site of sortedNewSites) {
          message += "* " + site + "\n";
        }
        content.innerText = message;
        console.log(message);
        const submitElement = document.getElementById("submit");
        submitElement.disabled = false;
      })
      .catch(onError);
  } catch (e) {
    content.innerText = `JSON parsing error: ${e}`;
    submitElement.disabled = true;
  }
}

function handleSubmitted() {
  console.log("Loading imported");
  console.log(importedSitesToLoad);
  const content = document.querySelector(".content");
  browser.storage.local.set(importedSitesToLoad)
    .then(() => {
      const message = "Successfully imported new sites"
      console.log(message);
      content.innerText += "\n" + message;
    })
    .catch((e) => {
      const message = "ERROR! Failure to save to storage: " + e;
      console.log(message);
      content.innerText = message;
    })
    .then(() => {
      const submitElement = document.getElementById("submit");
      submitElement.disabled = true;
    });
}

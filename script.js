const input = document.getElementById("input");
input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        e.preventDefault();
        input.disabled = true;
        const url = input.value;
        load(url)
            .then(({ filename, data }) => {
                saveAs(data, filename);
                input.disabled = false;
            });
    }
});

function proxyFetch(resource, options) {
    const url = `https://lbproxy.herokuapp.com?url=${resource}`;
    return fetch(url, options);
}

function setProgress(progress) {
    const e = document.getElementById("progress");
    e.style.setProperty("--progress", Math.round(progress * 100));
}

function load(url) {
    return new Promise(resolve => {
        setProgress(0);
        proxyFetch(`${url}.json`)
            .then(resp => resp.json())
            .then(json => {
                let pages = [];
                for (let page of json.readableProduct.pageStructure.pages) {
                    if (page.type === "main") {
                        pages.push(page);
                    }
                }

                const title = json.readableProduct.title;
                const pageCount = pages.length;

                let data = [];
                const zipChunkCount = pageCount * 3 + 1;
                const zip = new fflate.Zip((err, dat, final) => {
                    if (!err) {
                        data.push(dat);
                        setProgress(data.length / zipChunkCount);
                        if (final) resolve({ filename: `${title}.zip`, data: new Blob(data) });
                    }
                });

                let progress = 0;

                for (let [i, page] of pages.entries()) {
                    let canvas = document.createElement("canvas");
                    let context = canvas.getContext("2d");

                    canvas.width = page.width;
                    canvas.height = page.height;
                    const chunkWidth = Math.floor(page.width / 32) * 8;
                    const chunkHeight = Math.floor(page.height / 32) * 8;

                    proxyFetch(page.src)
                        .then(resp => resp.blob())
                        .then(blob => {
                            let img = new Image();
                            img.onload = () => {
                                context.drawImage(img, 0, 0);
                                for (let y = 0; y < 4; y++) {
                                    for (let x = 0; x < 4; x++) {
                                        context.drawImage(img, x * chunkWidth, y * chunkHeight, chunkWidth, chunkHeight, y * chunkWidth, x * chunkHeight, chunkWidth, chunkHeight);
                                    }
                                }
                                new Promise(resolve => canvas.toBlob(resolve))
                                    .then(blob => blob.arrayBuffer())
                                    .then(buffer => {
                                        let file = new fflate.ZipPassThrough(`${i + 1}.png`);
                                        zip.add(file);
                                        file.push(new Uint8Array(buffer), true);
                                        if (++progress === pageCount) zip.end();
                                    });
                            };
                            img.src = URL.createObjectURL(blob);
                        });
                }
            });
    });
}
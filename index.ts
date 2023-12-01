import axios from "axios";
import * as fs from 'fs';
import { glob } from 'glob';
import DesciExtractor from "./lib/desciExtractor";

interface RootComponentPayload {
    path: string,
    cid: string,
    externalUrl?: string,
    keywords?: string[],
    description?: string,
    url?: string,
    title?: string,
    ontologyPurl?: string,
    cedarLink?: string,
    controlledVocabTerms?: string[],
}

interface RootComponent {
    id: string,
    name: string,
    type: string,
    payload: RootComponentPayload,
    starred: boolean,
}

class pyExtractor {
    pid: number;

    constructor(PID: number) {
        this.pid = PID;
    }

    async getRoot() {
        const response = await axios.get(`https://beta.dpid.org/${this.pid.toString()}?raw`, {
            headers: {
                "Content-Type": "application/json"
            }
        })

        const components: RootComponent[] = response.data.components;

        for (let x = 0; x < components.length; x++) {
            if (components[x].name === "Code Repository") {
                await this.getPyFiles(components[x].payload.path)
            }
        }
        
        await this.getParentFunctions();

        await this.upload();
    } 

    async getPyFiles(path: string) {
        const response = await axios.get(`https://beta.dpid.org/${this.pid.toString()}/${path}?raw`)
    
        const codeLinks = response.data.Links;
        
        // If no links/files
        if (!codeLinks) return []

        let pyFiles: any[] = []

        for (let x = 0; x < codeLinks.length; x++) {
            // If python file is found
            if (codeLinks[x].Name.includes(".") && codeLinks[x].Name.includes(".py")) {
                console.log("Python file found - " + codeLinks[x].Name)
                
                let file = {
                    ...codeLinks[x],
                    path: `${path}/${codeLinks[x].Name}`
                }
                
                await this.writePyFile(file.Hash["/"], file.Name)

                pyFiles.push(file)
                continue;
            } else if (codeLinks[x].Name.includes(".")) {
                // Filetype other than PY
                console.log("Non-python file found - " + codeLinks[x].Name)
                continue;
            } else {
                // Directory
                console.log("Directory found - " + codeLinks[x].Name)
                const sub: any = await this.getPyFiles(`${path}/${codeLinks[x].Name}`)
                pyFiles = [...pyFiles, ...sub]
            }
        }

        return pyFiles
    }

    async writePyFile(hash: string, name: string): Promise<void> {
        if (!fs.existsSync('./desci')) fs.mkdirSync('./desci')

        const response = await axios.get(`https://ipfs.desci.com/ipfs/${hash}`)

        fs.writeFileSync(`desci/${name}`, response.data, 'utf-8')
    }

    async getParentFunctions(): Promise<void> {
        const parentFiles = await glob('./desci/*.py', {
            ignore: './inputs/example.py'
        })

        parentFiles.forEach((dir: string) => {
            const extract = new DesciExtractor({
                directory: dir
            })

            extract.pullFunctions()
        })
    }

    async upload(): Promise<void> {
        const files = await glob('./desci/**/*')

        let manifest: any = {}

        // Add parent files to dictionary
        for (let x = 0; x < files.length; x++) {
            if (files[x].split("/").length === 2 && files[x].includes(".py")) {
                let data = new FormData();
                let fileBuffer = await fs.readFileSync(`./${files[x]}`)
                let fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' })
                data.append('file', fileBlob, files[x].split("/")[1]);

                const response = await axios("http://127.0.0.1:5001/api/v0/add?hash=sha2-256&pin=true&to-files=/&raw-leaves=true", {
                    method: "post",
                    data
                })

                manifest = {
                    ...manifest,
                    [`${files[x].split("/")[1]}`]: {
                        "cid": response.data.Hash,
                        "dependencies": []
                    }
                };
            }
        }

        // Add dependencies to dictionary
        for (let x = 0; x < Object.keys(manifest).length; x++) {
            // Check if parent has any dependencies
            if (fs.existsSync(`./desci/${Object.keys(manifest)[x].split('.py')[0]}`)) {
                const deps = await glob(`./desci/${Object.keys(manifest)[x].split('.py')[0]}/*`)

                for (let y = 0; y < deps.length; y++) {
                    let data = new FormData();
                    let fileBuffer = await fs.readFileSync(`./${deps[y]}`)
                    let fileBlob = new Blob([fileBuffer], { type: 'application/octet-stream' })
                    data.append('file', fileBlob, deps[y].split("/")[2]);
    
                    const response = await axios("http://127.0.0.1:5001/api/v0/add?hash=sha2-256&pin=true&to-files=/&raw-leaves=true", {
                        method: "post",
                        data
                    })
    
                    manifest[Object.keys(manifest)[x]].dependencies = [
                        ...manifest[Object.keys(manifest)[x]].dependencies,
                        {
                            "name": deps[y].split("/")[2],
                            "cid": response.data.Hash
                        }
                    ]
                }
            } else {
                continue
            }
        }

        // Write manfiest
        fs.writeFileSync('desci/manifest.json', JSON.stringify(manifest, null, 4), 'utf-8')
        console.log("[!] Wrote Manifest to desci folder")
    }
}

async function main() {
    // Replace PID with node of interest
    let tmp = new pyExtractor(76)
    const traversal = await tmp.getRoot();
}

main();
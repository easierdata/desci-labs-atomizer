/**
 * @file extractor.ts
 * 
 * Ingests function location and write to output folder
 */

import * as fs from 'fs'
import * as dotenv from "dotenv"
dotenv.config()

class DesciExtractor {
    directory: fs.PathLike

    constructor(data: {
        directory: fs.PathLike,
    }) {
        this.directory = data.directory
    }

    /**
     * Pull functions
     */
    pullFunctions(): void {
        try {
            // Read file contents and split by line
            const fileContents = fs.readFileSync(this.directory, 'utf-8')
            const fileLines = fileContents.split('\n')
            // let line = 0; // keep track of line number
            let functionName = "" // keep track of function traversal
            let functionLines = []

            for (let x = 0; x < fileLines.length; x++) {
                const line = fileLines[x]

                if (functionName === "" && (line.trim().startsWith('class') || line.trim().startsWith('def'))) {
                    functionName = line.trim().split(" ")[1].split("(")[0];
                    functionLines = []
                    console.log("Extracting: " + functionName)
                    functionLines.push(line)
                } else if ((functionName !== "" && line === "") || x === fileLines.length) {
                    // join lines and write func to file
                    if ((x + 1) != fileLines.length && fileLines[x + 1] !== "" && (fileLines[x + 1]?.match(/^\s*/) && fileLines[x + 1]?.match(/^\s*/)?.[0].length === 0)) {
                        this.writeFunction(functionName, functionLines)
                        functionLines = []
                        functionName = ""
                    }
                } else if (functionName !== "" && line !== "") {
                    // push line to function lines
                    functionLines.push(line)
                }
            }
        } catch (e: any) {
            throw new Error(`Error extracting functions: ${e}`)
        }
    }

    writeFunction(functionName: string, fileLines: string[]): void {
        // Make directory for parent file if it doesnt exist
        let parent = this.directory.toString().split('/')[this.directory.toString().split('/').length - 1].split('.py')[0]
        if (!fs.existsSync(`./desci/${parent}`)) fs.mkdirSync(`./desci/${parent}`)

        let joined = ''
        for (let x = 0; x < fileLines.length; x++) {
            joined += fileLines[x] + '\n'
        }

        fs.writeFileSync(`./desci/${parent}/${functionName}.py`, joined, 'utf8')
    }
}

export default DesciExtractor
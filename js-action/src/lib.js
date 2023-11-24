import { execSync } from 'child_process';
import {existsSync, rmdirSync, mkdirSync} from 'fs';


export function runCommand(command, exit = true) {
    try {
        console.log('\x1b[34m%s\x1b[0m',`run command: ${command}`);
        execSync(command, { stdio: 'inherit' });
      } catch (error) {
        console.error(`Command "${command}" failed with error: ${error.message}`);
        if (exit) {
            process.exit(1);
        }
    }
}

export function generateRandomString(length) {
    const characters = 'abcdefghijklmnopqrstuvwxyz';
    let randomString = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        randomString += characters.charAt(randomIndex);
    }

    return randomString;
}

export function createDir(dir) {
    const folderPath = `./${dir}`;
    if (existsSync(folderPath)) {
        try {
            rmdirSync(folderPath, { recursive: true });
        } catch (err) {
            console.error(`Error deleting folder ${folderPath}: ${err.message}`);
            process.exit(1);
        }
    }
    
    try {
        mkdirSync(folderPath);
    } catch (err) {
        console.error(`Error creating folder ${folderPath}: ${err.message}`);
        process.exit(1);
    }
}
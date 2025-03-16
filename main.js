class SystemTerminal {
    constructor(id) {
        this.id = id;
        this.element = document.createElement("p");
        this.element.id = id;
        this.inputBuffer = "";
        this.cursorPosition = 0;
        this.inputCallback = null;
        this.inputPrompt = "";
        this.api = {
            init: () => {
                this.element.className = "system-terminal";
                document.body.appendChild(this.element);
                document.addEventListener("keydown", this.handleKeyPress.bind(this));
            },
            invisibleInit: () => {
                this.element.className = "system-terminal";
                document.addEventListener("keydown", this.handleKeyPress.bind(this));
            },
            log: (msg, logToConsole = true) => {
                this.element.innerText += msg;
                this.element.scrollTop = this.element.scrollHeight;
                if (logToConsole) {
                    console.log(`${this.id} > ${msg}`);
                } 
            },
            getInput: (prompt) => {
                return new Promise((resolve) => {
                    this.inputPrompt = prompt;
                    this.inputBuffer = "";
                    this.cursorPosition = 0;
                    this.inputCallback = resolve;
                    this.updateDisplay();
                });
            },
            destroy: () => {
                this.element.remove();
                document.removeEventListener("keydown", this.handleKeyPress);
            },
            clear: () => {
                this.element.innerText = "";
            }
        };
    }

    async handleKeyPress(event) {
        if (this.inputCallback) {
            event.preventDefault();
            switch (event.key) {
                case "Enter":
                    const input = this.inputBuffer;
                    this.inputBuffer = "";
                    this.cursorPosition = 0;
                    this.inputPrompt = "";
                    this.element.innerText = this.element.innerText.substr(0, this.element.innerText.length - 1);
                    this.element.innerText += "\n";
                    this.inputCallback(input);
                    this.inputCallback = null;
                    break;
                case "Backspace":
                    if (this.cursorPosition > 0) {
                        this.inputBuffer = 
                            this.inputBuffer.slice(0, this.cursorPosition - 1) + 
                            this.inputBuffer.slice(this.cursorPosition);
                        this.cursorPosition--;
                    }
                    break;
                case "ArrowLeft":
                    if (this.cursorPosition > 0) this.cursorPosition--;
                    break;
                case "ArrowRight":
                    if (this.cursorPosition < this.inputBuffer.length) 
                        this.cursorPosition++;
                    break;
                default:
                    if (event.ctrlKey && event.key === "v") {
                        const clipboardText = await navigator.clipboard.readText();
                        if (clipboardText) {
                            const beforeCursor = 
                                this.inputBuffer.slice(0, this.cursorPosition);
                            const afterCursor = 
                                this.inputBuffer.slice(this.cursorPosition);
                            this.inputBuffer = beforeCursor + clipboardText + afterCursor;
                            this.cursorPosition += clipboardText.length;
                        }
                    } else if (event.key.length === 1) { 
                        const beforeCursor =
                            this.inputBuffer.slice(0, this.cursorPosition);
                        const afterCursor =
                            this.inputBuffer.slice(this.cursorPosition);
                        this.inputBuffer =
                            beforeCursor + event.key + afterCursor;
                        this.cursorPosition++;
                    }
            }
            this.updateDisplay();
        }
    }

    updateDisplay() {
        const displayText = 
            `${this.inputPrompt}${this.inputBuffer}`;
        const cursorIndex =
            `${this.inputPrompt}`.length + 
            `${this.cursorPosition}`;
        if (this.inputBuffer === "") {
            this.element.innerText = this.element.innerText.split("\n").slice(0, -1).join("\n") + "\n" + displayText;
        } else {
            this.element.innerText = this.element.innerText.split("\n").slice(0, -1).join("\n") + "\n" +
                displayText.slice(0, cursorIndex) + "█" + displayText.slice(cursorIndex);
        }
        this.element.scrollTop = this.element.scrollHeight;
    }
}


class Service {
    constructor(name, version, api) {
        this.name = name;
        this.version = version;
        this.api = api || {};
    }
}

class Status {
    static ACTIVE = new Status("active");
    static INACTIVE = new Status("inactive");
    static TERMINATED = new Status("terminated");

    constructor(value) {
        this.value = value;
    }
    
    static fromValue(value) {
        return Object.values(Status).find(status => status.value === value);
    }
    
    toString() {
        return `Status.${this.value}`;
    }
}

class Process { 
    constructor(application, pid, memoryOffset, services) {
        this.application = application;
        this.pid = pid;
        this.processMemory = {
            globalOffset: memoryOffset,
            content: []
        };
        this.status = Status.INACTIVE;
        this.services = services;
        this.api = {
            writeMemory: (index, content) => {
                this.processMemory.content[index] = content;
                this.services.memoryrws.api.syncProcessMemoryToGlobal(this);
            },
            readMemory: (index) => {
                return this.processMemory.content[index];
            }
        };
    }

    toString() {
        return `Process ${this.application.name}#${this.pid}`;
    }
}

class Application {
    constructor(name, version) {
        this.name = name;
        this.version = version;
        this.exec = null;
        this.api = {
            createExecutableFromFunction: (func) => {
                this.exec = func;
            }
        };
    }
}

class AuroraONFSDirectory {
    constructor(name, fileSystemID, content = []) {
        this.name = name;
        this.content = content;
        this.fileSystemID = fileSystemID;
        this.type = "directory";
        this.api = {
            addChild: (item) => {
                const fileSystem = AuroraONFSFileSystem.getFileSystemByID(this.fileSystemID);
                
                if (this.content.indexOf(item) !== -1) { return; }

                this.content.push(item);
                fileSystem.api.syncToStorage();
            },
            removeChild: (item) => {
                const fileSystem = AuroraONFSFileSystem.getFileSystemByID(this.fileSystemID);

                if (this.content.indexOf(item) === -1) { return; }

                this.content.splice(this.content.indexOf(item), 1);
                fileSystem.api.syncToStorage();
            }
        }
    }  
}

class AuroraONFSFile {
    constructor(name, extension, content, fileSystemID) {
        this.name = name;
        this.extension = extension;
        this.content = content;
        this.fileSystemID = fileSystemID;
        this.type = "file";
        this.api = {
            writeContent: (newContent) => {
                this.content = newContent;
            },
            appendContent: (newContent) => {
                this.content += newContent;
            },
            clearContent: () => {
                this.content = "";
            }
        }
    }
}

class AuroraONFSApplicationFile extends AuroraONFSFile {
    constructor(name, application, fileSystemID) {
        const serializedApplication = {
            ...application,
            exec: application.exec ? application.exec.toString() : null
        };
        super(name, "apn", JSON.stringify(serializedApplication), fileSystemID);
    }

    static getApplicationFromFile(file) {
        const parsedContent = JSON.parse(file.content);
        if (!parsedContent.name || !parsedContent.version) {
            return null;
        }
        const app = new Application(parsedContent.name, parsedContent.version);
        if (parsedContent.exec) {
            const func = eval(`(${parsedContent.exec})`);
            app.api.createExecutableFromFunction(func);
        }
        return app;
    }
}

class AuroraONFSFileSystem {
    static fileSystems = {};

    constructor(id) {
        this.id = id;
        this.rootDirectory = null;
        AuroraONFSFileSystem.fileSystems[id] = this;
        this.api = {
            init: (outputTerm = new SystemTerminal(this.dbName)) => {
                outputTerm.api.log(`Creating new AuroraONFS filesystem with id ${this.id}\n`);
                const rootDir = new AuroraONFSDirectory("onfsRoot", this.id, []);
                this.rootDirectory = rootDir;
                outputTerm.api.log(`Created and assigned AuroraONFS filesystem ${this.id}'s root directory (${this.rootDirectory.name})\n`);

                this.api.syncToStorage();
                outputTerm.api.log(`Created and stored AuroraONFS filesystem ${this.id}\n`);
            },
            getItemByPath: (path) => {
                if (path === "onfsRoot" || path === "/") {
                    return this.rootDirectory;
                }

                if (path.startsWith("onfsRoot/")) {
                    path = path.slice(9);
                };
                const pathArray = path.split("/");
                let currentObj = this.rootDirectory;
                for (let i = 0; i < pathArray.length; i++) {

                    try {
                        currentObj = currentObj.content.find(item => item.name === pathArray[i]);
                        if (!currentObj) return null;
                    } catch (e) {
                        return null;
                    }
                }
                return currentObj;
            },
            getPathByItem: (item) => {
                const findPath = (currentItem, targetItem, currentPath) => {
                    if (currentItem === targetItem) {
                        return currentPath;
                    }

                    if (currentItem.type === "directory") {
                        for (const child of currentItem.content) {
                            const result = findPath(child, targetItem, `${currentPath}/${child.name}`);
                            if (result) {
                                return result;
                            }
                        }
                    }

                    return null;
                };

                return findPath(this.rootDirectory, item, this.rootDirectory.name);
            },
            syncToStorage: () => {
                const fileSystemObject = {
                    onfsRoot: this.rootDirectory
                };

                localStorage.setItem(`AuroraONFS-${this.id}`, JSON.stringify(fileSystemObject));
            }
        }
    }

    static getFileSystemByID(id) {
        return AuroraONFSFileSystem.fileSystems[id];
    }

    static createFromFSObject(fsObject, fsId) {
        if (!fsObject.onfsRoot) {
            return;
        }
        
        let newFS = new AuroraONFSFileSystem(fsId);
        
        let newRoot = new AuroraONFSDirectory("onfsRoot", newFS.id, fsObject.onfsRoot.content);

        function reconstructSubdirectories(directory) {
            for (let i in directory.content) {
                let item = directory.content[i];
                if (item.type === "directory" && item.api.addChild === undefined) {
                    let newDir = new AuroraONFSDirectory(item.name, newFS.id, item.content);
                    directory.content[i] = newDir;
                    reconstructSubdirectories(item);
                }
                if (item.type === "file" && item.api.writeContent === undefined) {
                    let newFile = new AuroraONFSFile(item.name, item.extension, item.content, newFS.id);
                    directory.content[i] = newFile;
                }
            }
        }

        reconstructSubdirectories(newRoot);

        newFS.rootDirectory = newRoot;

        return newFS;
    }
}

class SystemKernel {
    constructor(name, version, api) {
        this.name = name;
        this.version = version;
        this.globalMemory = [];
        this.registeredServices = {};
        this.runningProcesses = [];
        this.nextPID = 0;
        this.nextGMemOffset = 0;
        this.fileSystem = null;

        this.api = api || {
            registerService: (service) => {
                this.registeredServices[service.name] = service;
            },
            createMemoryRWService: () => {
                this.terminal.api.log("\nCreating service memoryrws\n");
                const memoryrws = new Service("memoryrws", "0.1.0", {
                    syncProcessMemoryToGlobal: (process) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                    },
                    syncProcessMemoryFromGlobal: (process) => {
                        process.processMemory.content = this.globalMemory[process.processMemory.globalOffset];
                    },
                    writeProcessMemory: (process, index, content) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                        this.globalMemory[process.processMemory.globalOffset][index] = content;
                        process.processMemory.content = this.globalMemory[process.processMemory.globalOffset];
                    },
                    readProcessMemory: (process, index) => {
                        this.globalMemory[process.processMemory.globalOffset] = process.processMemory.content;
                        return this.globalMemory[process.processMemory.globalOffset][index]
                    }
                });
                this.api.registerService(memoryrws);
            },  
            createKTerminalService: () => {
                this.terminal.api.log("Creating service kterminals\n");
                const kterminals = new Service("kterminals", "0.1.0", {
                    log: (msg) => {
                        this.terminal.api.log(msg);
                    },
                    getInput: async (prompt) => {
                        return await this.terminal.api.getInput(prompt);
                    },
                    destroy: () => {
                        this.terminal.api.destroy();
                    },
                    setTerminal: (terminal) => {
                        this.terminal = terminal;
                    }
                });
                this.api.registerService(kterminals);
            },
            createProcessMgrService: () => {
                this.terminal.api.log("Creating service processmgrs\n");
                const processmgrs = new Service("processmgrs", "0.2.0", {
                    createProcess: (application) => {
                        return this.api.createProcess(application); // kernel method, not service method
                    },
                    startProcess: (process, args = [], terminal = new SystemTerminal("stdout")) => {
                        this.api.startProcess(process, args, terminal); // kernel method, not service method
                    },
                    getRunningProcesses: () => {
                        return this.runningProcesses;
                    },
                    getNextAvailablePID: () => {
                        return this.nextPID;
                    },
                    getDesktopEnvironmentProcess: () => {
                        // dont make this function use find it doesnt work.
                        // if you make it work then please use it though
                        // it just returns undefined even when deskenv is running :(
                        for (const i in this.runningProcesses) {
                            const process = this.runningProcesses[i];
                            if (process.application.name === "deskenv") {
                                return process;
                            }
                        }
                    }
                });
                this.api.registerService(processmgrs);
            },
            createGraphicsMgrService: () => {
                this.terminal.api.log("Creating service graphicsmgrs\n");
                const graphicsmgrs = new Service("graphicsmgrs", "0.2.0", {
                    clearScreen: () => {
                        document.body.innerHTML = "";
                    },
                    createRectangle: (posX, posY, sizeX, sizeY, colorHex, parent = document.body) => {
                        const newRect = document.createElement("div");
                        newRect.style.position = "absolute";
                        newRect.style.left = `${posX}px`;
                        newRect.style.top = `${posY}px`;
                        newRect.style.width = `${sizeX}px`;
                        newRect.style.height = `${sizeY}px`;
                        newRect.style.backgroundColor = colorHex;
                        parent.appendChild(newRect);
                        return newRect;
                    },
                    createEllipse: (posX, posY, sizeX, sizeY, colorHex, parent = document.body) => {
                        const newRect = document.createElement("div");
                        newRect.style.position = "absolute";
                        newRect.style.left = `${posX}px`;
                        newRect.style.top = `${posY}px`;
                        newRect.style.width = `${sizeX}px`;
                        newRect.style.height = `${sizeY}px`;
                        newRect.style.backgroundColor = colorHex;
                        newRect.style.borderRadius = "50%";
                        parent.appendChild(newRect);
                        return newRect;
                    },
                    createHTMLWindow: (posX, posY, sizeX, sizeY, backgroundColorHex, colorHex, content, parent = document.body) => {
                        const newWindow = document.createElement("div");
                        newWindow.style.position = "absolute";
                        newWindow.style.left = `${posX}px`;
                        newWindow.style.top = `${posY}px`;
                        newWindow.style.width = `${sizeX}px`;
                        newWindow.style.height = `${sizeY}px`;
                        newWindow.style.backgroundColor = backgroundColorHex;
                        newWindow.style.color = colorHex;
                        newWindow.style.margin = 0;
                        newWindow.style.padding = 0;
                        newWindow.appendChild(content);
                        parent.appendChild(newWindow);
                        return newWindow;
                    },
                    createTextualElement: (posX, posY, fontSize, foreColorHex, content, backColorHex = "#00000000", parent = document.body) => {
                        const newText = document.createElement("span");
                        newText.style.position = "absolute";
                        newText.style.left = `${posX}px`;
                        newText.style.top = `${posY}px`;
                        newText.style.fontSize = `${fontSize}px`;
                        newText.style.color = foreColorHex;
                        newText.textContent = content;
                        newText.style.backgroundColor = backColorHex;
                        parent.appendChild(newText);
                        return newText;
                    },
                    createImage: (posX, posY, sizeX, sizeY, url, parent = document.body) => {
                        const newImage = document.createElement("img");
                        newImage.style.position = "absolute";
                        newImage.style.left = `${posX}px`;
                        newImage.style.top = `${posY}px`;
                        newImage.style.width = `${sizeX}px`;
                        newImage.style.height = `${sizeY}px`;
                        newImage.src = url;
                        parent.appendChild(newImage);
                        return newImage;
                    },
                    getScreenHeight: () => {
                        return window.innerHeight;
                    },
                    getScreenWidth: () => {
                        return window.innerWidth;
                    }
                });
                this.api.registerService(graphicsmgrs);
            },
            createFileSystemRWService: () => {
                this.terminal.api.log("Creating service fsrws");
                const fsrws = new Service("fsrws", "0.1.0", {
                    getItemByPath: (path) => {
                        return this.fileSystem.api.getItemByPath(path);
                    },
                    getRootDirectory: () => {
                        return this.fileSystem.rootDirectory;
                    },
                    getPathByItem: (item) => {
                        return this.fileSystem.api.getPathByItem(item);
                    },
                    getFileSystemID: () => {
                        return this.fileSystem.id;
                    }
                });
                this.api.registerService(fsrws);
            },
            createTimeService: () => {
                this.terminal.api.log("Creating service times");
                const times = new Service("times", "0.1.0", {
                    getCurrentTime24HourHM: () => {
                        const now = new Date();
                        const localHours = now.getHours();
                        const localMinutes = now.getMinutes();
                        return `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`;
                    },
                    getCurrentTime24HourHMS: () => {
                        const now = new Date();
                        const localHours = now.getHours();
                        const localMinutes = now.getMinutes();
                        const localSeconds = now.getSeconds();
                        return `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}:${String(localSeconds).padStart(2, '0')}`;
                    },
                    getCurrentTime12HourHM: () => {
                        const now = new Date();
                        let localHours = now.getHours();
                        const localMinutes = now.getMinutes();
                        let amPm;
                        if (localHours > 11) {
                            amPm = "PM";
                            if (localHours !== 12) {
                                localHours -= 12
                            }
                        } else {
                            amPm = "AM";
                        }
                        return `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')} ${amPm}`;
                    },
                    getCurrentTime12HourHMS: () => {
                        const now = new Date();
                        let localHours = now.getHours();
                        const localMinutes = now.getMinutes();
                        const localSeconds = now.getSeconds();
                        let amPm;
                        if (localHours > 11) {
                            amPm = "PM";
                            if (localHours !== 12) {
                                localHours -= 12;
                            }
                        } else {
                            amPm = "AM";
                            if (localHours === 0) {
                                localHours = 12;
                            }
                        }
                        return `${String(localHours).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}:${String(localSeconds).padStart(2, '0')} ${amPm}`;
                    },

                });
                this.api.registerService(times);
            },
            createSystemInfoService: () => {
                const sysinfos = new Service("sysinfos", "0.1.0", {
                    getKernelName: () => {
                        return this.name;
                    },
                    getKernelVersion: () => {
                        return this.version;
                    }
                });
                this.api.registerService(sysinfos);
            },
            createServices: () => {
                this.api.createMemoryRWService();
                this.api.createKTerminalService();
                this.api.createProcessMgrService();
                this.api.createGraphicsMgrService();
                this.api.createFileSystemRWService();
                this.api.createTimeService();
                this.api.createSystemInfoService();
            },
            createProcess: (application) => {
                const newProcess = new Process(application, this.nextPID, this.nextGMemOffset, this.registeredServices);
                this.nextPID++;
                this.nextGMemOffset++;
                return newProcess;
            },
            startProcess: (process, args = {}, terminal ) => {
                if (process.status != Status.INACTIVE) {
                    return;
                }
                process.status = Status.ACTIVE;
                process.application.exec(process, this.registeredServices, args, terminal);

                this.runningProcesses[`${process.application.name}#${process.pid}`] = process;
            },
            startTests: () => {
                const memTestApplication = new Application("memtest", "1.0.0");
                memTestApplication.api.createExecutableFromFunction((process, services) => {
                    process.api.writeMemory(0, "Memory is readable and writable\n");
                    const text = services.memoryrws.api.readProcessMemory(process, 0);
                    services.kterminals.api.log(text);
                });

                this.terminal.api.log("\nTesting memory (if there is no output, memoryrws is malfunctioned)\n");

                const memTestProcess = this.api.createProcess(memTestApplication);
                this.api.startProcess(memTestProcess);

                const procTestApplication = new Application("proctest", "1.0.0");
                procTestApplication.api.createExecutableFromFunction((process, services) => {
                    const procTest2Application = new Application("proctest2", "1.0.0");
                    procTest2Application.api.createExecutableFromFunction((process2, services2) => {
                        const runningProcesses = services.processmgrs.api.getRunningProcesses();
                        for (let proc in runningProcesses) {
                            services.kterminals.api.log(`${proc}\n`);
                        }
                        services.kterminals.api.log("exiting procTest2Application.exec\n");
                    });
                    const procTest2Process = services.processmgrs.api.createProcess(procTest2Application);
                    services.processmgrs.api.startProcess(procTest2Process);
                    const runningProcesses = services.processmgrs.api.getRunningProcesses();
                    for (let proc in runningProcesses) {
                        services.kterminals.api.log(`${proc}\n`);
                    }
                    services.kterminals.api.log(`self (procTestApplication.exec) is ${process}\n`);
                    services.kterminals.api.log(`next available PID is ${services.processmgrs.api.getNextAvailablePID()}\n`);

                    services.kterminals.api.log("Process management works");
                });

                this.terminal.api.log("\nTesting process management (if there is no output, processmgrs is malfunctioned)\n");

                const procTestProcess = this.api.createProcess(procTestApplication);
                this.api.startProcess(procTestProcess);

                const graphicsTestApplication = new Application("graphicstest", "1.0.0");
                graphicsTestApplication.api.createExecutableFromFunction((process, services) => {
                    const screenWidth = services.graphicsmgrs.api.getScreenWidth();
                    const screenHeight = services.graphicsmgrs.api.getScreenHeight();

                    services.graphicsmgrs.api.createRectangle(10, 10, 25, 25, "#ff0000");
                    services.graphicsmgrs.api.createEllipse(40, 10, 25, 25, "#00ff00");

                    const chwContent = document.createElement("p");
                    chwContent.innerText = "createHTMLWindow";
                    chwContent.style.margin = 0;
                    chwContent.style.fontSize = "14px";
                    services.graphicsmgrs.api.createHTMLWindow(10, 40, 150, 25, "#ffffff", "#0000ff", chwContent);
                    services.graphicsmgrs.api.createTextualElement(500, 100, 20, "#0000ff", "createTextualElement", "#ffffff");
                    services.graphicsmgrs.api.createImage(screenWidth - 110, screenHeight - 110, 100, 100, "https://raw.githubusercontent.com/lilafian/aurora/master/img/auroralogo-white.png");
                    services.kterminals.api.log(screenWidth + "\n");
                    services.kterminals.api.log(screenHeight + "\n");
                    services.kterminals.api.log("Graphics service works (assuming elements are on the screen)\n");
                });
                
                this.terminal.api.log("\nTesting graphics API (if there is no output, graphicsmgrs is malfunctioned)\n");

                const graphicsTestProcess = this.api.createProcess(graphicsTestApplication);
                this.api.startProcess(graphicsTestProcess);

            },
            initializeFileSystem: (ignoreExisting = false) => {
                if (!ignoreExisting && localStorage.getItem(`AuroraONFS-${this.name}-fs`) !== null) {
                    this.terminal.api.log(`Found filesystem AuroraONFS-${this.name}-fs, loading\n`);
                    
                    const fsObject = JSON.parse(localStorage.getItem(`AuroraONFS-${this.name}-fs`));

                    const newFS = AuroraONFSFileSystem.createFromFSObject(fsObject, `${this.name}-fs`);

                    this.fileSystem = newFS;

                    this.terminal.api.log(`Loaded filesystem AuroraONFS-${this.name}-fs\n`);
                    return;
                }

                this.terminal.api.log("initializeFileSystem() called with ignoreExisting = true, any existing filesystem will be overwritten!\n");

                this.fileSystem = new AuroraONFSFileSystem(`${this.name}-fs`);
                this.fileSystem.api.init(this.terminal);

                const auroraDir = new AuroraONFSDirectory("aurora", this.fileSystem.id);
                this.fileSystem.rootDirectory.api.addChild(auroraDir);

                const execDir = new AuroraONFSDirectory("exec", this.fileSystem.id);
                this.fileSystem.rootDirectory.api.addChild(execDir);

                const userDir = new AuroraONFSDirectory("user", this.fileSystem.id);

                const welcomeFile = new AuroraONFSFile("welcome", "txt", "welcome to aurora!", this.fileSystem.id);
                
                userDir.api.addChild(welcomeFile);

                this.fileSystem.rootDirectory.api.addChild(userDir);
            },
            createShell: () => {
                const auroraShell = new Application("AuroraShell", "0.1.0");
                auroraShell.api.createExecutableFromFunction(async (process, services, argv, terminal = null) => {
                    let term;
                    if (!terminal) {
                        services.kterminals.api.destroy();
                        services.graphicsmgrs.api.clearScreen();
                        term = new SystemTerminal(`AuroraShell-${process.pid}`);
                        term.api.init();
                    } else {
                        term = terminal;
                    }

                    term.api.log(`Aurora Shell version ${process.application.version}\n`, false);
                    term.api.log("Use 'help' to display a list of commands\n", false);
                    term.api.log("Use 'deskEnv' to start the graphical interface\n", false);

                    function parseCommand(command) {
                        let argv = command.split(/\s+/);
                        let argc = argv.length;
                        return {
                            argv: argv,
                            argc: argc
                        }
                    }

                    function getAbsolutePath(path) {
                        if (path.startsWith("onfsRoot/")) {
                            return path;
                        }
                        else if (path.startsWith("/")) {
                            return `onfsRoot${path}`;
                        }
                        else {
                            return `${services.fsrws.api.getPathByItem(currentDirectory)}/${path}`;
                        }

                    }

                    let currentDirectory = services.fsrws.api.getItemByPath("onfsRoot/user");

                    while (true) {
                        let input = await term.api.getInput(`${services.fsrws.api.getPathByItem(currentDirectory).slice(8)}$ `); // slice 8 from the path to remove "onfsRoot"
                        switch (input.split(/\s+/)[0]) {
                            case "exit":
                                term.api.destroy();
                                return;
                            case "echo": {
                                const args = parseCommand(input);
                                args.argv.splice(0, 1);
                                term.api.log(args.argv.join(" ") + "\n", false);
                                break;
                            }
                            case "help": {
                                const args = parseCommand(input);
                                if (args.argc === 1) {
                                    term.api.log(`AuroraShell version ${process.application.version}\n`, false);
                                    term.api.log("<NAME> indicates an argument, <NAME*> indicates a required argument\n", false);
                                    term.api.log("cd - changes the current directory to <DIRECTORY> or onfsRoot/user if <DIRECTORY> is not specified- cd <DIRECTORY>\n", false);
                                    term.api.log("clear - clear the terminal output - no args\n", false);
                                    term.api.log("exit - destroy the terminal and end the application - no args\n", false);
                                    term.api.log("echo - output <MESSAGE> to the terminal - echo <MESSAGE*>\n", false);
                                    term.api.log("fwrite - replace content of file at <FILE_PATH> with <NEW_CONTENT> - fwrite <FILE_PATH*> <NEW_CONTENT*>\n", false);
                                    term.api.log("fappend - append <NEW_CONTENT> to the end of the content of the file at <FILE_PATH> - fappend <FILE_PATH*> <NEW_CONTENT*>\n", false);
                                    term.api.log("fclear - clear the content of file at <FILE_PATH> - fclear <FILE_PATH*>\n", false);
                                    term.api.log("help - output a list of commands and version information to the terminal - no args\n", false);
                                    term.api.log("ls - output the content in the current directory - no args\n", false);
                                    term.api.log("mkdir - create a directory named <NAME> within the current directory - mkdir <NAME*>\n", false);
                                    term.api.log("procls - list all running processes - no args\n", false);
                                    term.api.log("rm - remove the item located at <PATH> - rm <PATH*>\n", false);
                                    term.api.log("Type the name of an application located in /exec followed by the arguments you want to pass to it\n", false);
                                }
                                break;
                            } 
                            case "clear": {
                                term.api.clear();
                                break;
                            }
                            case "ls": {
                                for (let i in currentDirectory.content) {
                                    let item = currentDirectory.content[i];
                                    if (item.type === "file") {
                                        term.api.log(`${item.name}.${item.extension} (${item.type.substring(0, 1)})\n`, false);
                                    } else {
                                        term.api.log(`${item.name} (${item.type.substring(0, 1)})\n`, false);
                                    }
                                }
                                break;
                            }
                            case "cd": {
                                const args = parseCommand(input);
                                
                                if (args.argc < 2) {
                                    currentDirectory = services.fsrws.api.getItemByPath("onfsRoot/user");
                                    break;
                                }

                                if (args.argv[1] === "/" || args.argv[1] === "onfsRoot") { currentDirectory = services.fsrws.api.getRootDirectory(); break; }

                                let newPath = getAbsolutePath(args.argv[1]);
                                
                                if (services.fsrws.api.getItemByPath(newPath) !== null && services.fsrws.api.getItemByPath(newPath).type === "directory") {
                                    currentDirectory = services.fsrws.api.getItemByPath(newPath);
                                } else {
                                    term.api.log(`${newPath} is not a valid directory\n`, false);
                                }

                                break;
                            }
                            case "mkdir": {
                                const args = parseCommand(input);

                                if (args.argc < 2) {
                                    term.api.log("Missing required argument <NAME*>\n", false);
                                    break;
                                }

                                if (services.fsrws.api.getItemByPath(`${services.fsrws.api.getPathByItem(currentDirectory)}/${args.argv[1]}`) === null && !args.argv[1].includes("/")) {
                                    const newDir = new AuroraONFSDirectory(args.argv[1], services.fsrws.api.getFileSystemID());

                                    currentDirectory.api.addChild(newDir);
                                } else {
                                    term.api.log(`${services.fsrws.api.getPathByItem(currentDirectory)}/${args.argv[1]} already exists or an illegal character was included in <NAME>.\n`, false);
                                }
                                break;
                            }
                            case "rm": {
                                const args = parseCommand(input);

                                if (args.argc < 2) {
                                    term.api.log("Missing required argument <PATH*>\n", false);
                                    break;
                                }

                                const path = getAbsolutePath(args.argv[1]);
                                const pathArray = path.split("/");
                                pathArray.splice(-1, 1);

                                const parentPath = pathArray.join("/");

                                const itemToRemove = services.fsrws.api.getItemByPath(path);
                                
                                services.fsrws.api.getItemByPath(parentPath).api.removeChild(itemToRemove);
                                break;
                            }
                            case "cat": {
                                const args = parseCommand(input);

                                if (args.argc < 2) {
                                    term.api.log("Missing required argument <FILE_PATH*>\n", false);
                                    break;
                                }
                                
                                if (args.argv[1].includes(".")) {
                                    args.argv[1] = args.argv[1].split(".")[0];
                                }

                                let filePath = getAbsolutePath(args.argv[1]);

                                if (services.fsrws.api.getItemByPath(filePath) !== null && services.fsrws.api.getItemByPath(filePath).type === "file") {
                                    term.api.log(services.fsrws.api.getItemByPath(filePath).content + "\n", false);
                                } else {
                                    term.api.log(`${filePath} is not a valid file\n`, false);
                                }

                                break;
                            }
                            case "fwrite": {
                                const args = parseCommand(input);
                                
                                if (args.argc < 2) {
                                    term.api.log("Missing required arguments <FILE_PATH*> <NEW_CONTENT*>\n", false);
                                    break;
                                }

                                if (args.argc < 3) {
                                    term.api.log("Missing required argument <NEW_CONTENT*>\n", false);
                                    break;
                                }

                                if (args.argv[1].includes(".")) {
                                    args.argv[1] = args.argv[1].split(".")[0];
                                }

                                const filePath = getAbsolutePath(args.argv[1]);
                                const file = services.fsrws.api.getItemByPath(filePath);
                                args.argv.splice(0, 2);
                                const newContent = args.argv.join(" ");

                                if (file !== null && file.type === "file") {
                                    file.api.writeContent(newContent);
                                } else {
                                    term.api.log(`${filePath} is not a valid file\n`, false);
                                }

                                break;
                            }
                            case "fappend": {
                                const args = parseCommand(input);
                                
                                if (args.argc < 2) {
                                    term.api.log("Missing required arguments <FILE_PATH*> <NEW_CONTENT*>\n", false);
                                    break;
                                }

                                if (args.argc < 3) {
                                    term.api.log("Missing required argument <NEW_CONTENT*>\n", false);
                                    break;
                                }

                                if (args.argv[1].includes(".")) {
                                    args.argv[1] = args.argv[1].split(".")[0];
                                }

                                const filePath = getAbsolutePath(args.argv[1]);
                                const file = services.fsrws.api.getItemByPath(filePath);
                                args.argv.splice(0, 2);
                                const newContent = args.argv.join(" ");
                                if (file !== null && file.type === "file") {
                                    file.api.appendContent(newContent);
                                } else {
                                    term.api.log(`${filePath} is not a valid file\n`, false);
                                }

                                break;
                            }
                            case "fclear": {
                                const args = parseCommand(input);

                                if (args.argc < 2) {
                                    term.api.log("Missing required argument <FILE_PATH*>\n", false);
                                    break;
                                }

                                const filePath = getAbsolutePath(args.argv[1]);
                                const file = services.fsrws.api.getItemByPath(filePath);

                                if (file !== null && file.type === "file") {
                                    file.api.clearContent();
                                } else {
                                    term.api.log(`${filePath} is not a valid file\n`, false);
                                }

                                break;
                            }
                            case "procls": {
                                const procs = services.processmgrs.api.getRunningProcesses();
                                for (const i in procs) {
                                    term.api.log(`${procs[i].application.name} (PID ${procs[i].pid})\n`, false);
                                }
                                break;
                            }
                            default: {
                                if (input.length > 0) {
                                    const args = parseCommand(input);
                                    const sysExecFile = services.fsrws.api.getItemByPath(`onfsRoot/exec/${args.argv[0]}`);
                                    const cdFile = services.fsrws.api.getItemByPath(`${services.fsrws.api.getPathByItem(currentDirectory)}/${args.argv[0]}`);
                                    args.argv.splice(0, 1);
                                    if (sysExecFile) {
                                        if (sysExecFile.extension !== "apn") {
                                            term.api.log(`${input.split(/\s+/)[0]} is not a valid command or application\n`, false);
                                            break;
                                        }
                                        const application = AuroraONFSApplicationFile.getApplicationFromFile(sysExecFile);
                                        const process = services.processmgrs.api.createProcess(application);
                                        services.processmgrs.api.startProcess(process, args.argv, term);
                                        break;
                                    }
                                    if (cdFile) {
                                        if (cdFile.extension !== "apn") {
                                            term.api.log(`${input.split(/\s+/)[0]} is not a valid command or application\n`, false);
                                            break;
                                        }
                                        const application = AuroraONFSApplicationFile.getApplicationFromFile(cdFile);
                                        const process = services.processmgrs.api.createProcess(application);
                                        services.processmgrs.api.startProcess(process, args.argv, term);
                                        break;
                                    }

                                    term.api.log(`${input.split(/\s+/)[0]} is not a valid command or application\n`, false);
                                    break;
                                }
                            }
                        }
                    }
                });

                return auroraShell;
            },
            createWingmanDeskEnv: () => {
                const wingman = new Application("deskenv", "1.0.0");
                wingman.api.createExecutableFromFunction((process, services, argv, terminal) => {
                    const argc = argv.length;
                    terminal.api.log("starting wingman...\n");
                    services.graphicsmgrs.api.clearScreen();
                    const term = new SystemTerminal("wingman-terminal");
                    term.api.init();
                    term.api.log("welcome to wingman!\n");

                    term.api.log("getting screen information...\n");
                    const screenWidth = services.graphicsmgrs.api.getScreenWidth();
                    const screenHeight = services.graphicsmgrs.api.getScreenHeight();
                    term.api.log(`screen width: ${screenWidth}\nscreen height: ${screenHeight}\n`);

                    const wallpaper = services.graphicsmgrs.api.createImage(0, 0, screenWidth, screenHeight, "https://images.unsplash.com/photo-1483347756197-71ef80e95f73?fm=jpg");
                    wallpaper.style.zIndex = "0";
                    wallpaper.style.userSelect = "none";

                    const colors = {
						transparent: "#00000000",
                        darkTransparent: "#00000077",
						darkenedScreen: "#0000005a"
                    }
                    
					term.api.log("creating topbar");
                    const topbar = services.graphicsmgrs.api.createRectangle(0, 0, screenWidth, screenHeight * 0.04, colors.darkTransparent);
					topbar.style.userSelect = "none";
                    topbar.style.zIndex = "1";

                    let timeString = services.times.api.getCurrentTime12HourHMS();
					term.api.log(`time is currently ${timeString}`);
                    const timeText = services.graphicsmgrs.api.createTextualElement(screenWidth - 15 - screenHeight * 0.0075 * 12, screenHeight * 0.01, screenHeight * 0.015, "#ffffff", timeString, "#00000000", topbar);
                    timeText.style.fontFamily = "Ubuntu, sans-serif, monospace";
                    
                    const timeStringUpdateInterval = setInterval(() => {
                        timeString = services.times.api.getCurrentTime12HourHMS();
                        timeText.textContent = timeString;
                    }, 1000);
                    
					term.api.log("Creating menu");
                    const menuButton = services.graphicsmgrs.api.createTextualElement(15, screenHeight * 0.01, screenHeight * 0.015, "#ffffff", "MENU", "#00000000", topbar);
					menuButton.style.fontFamily = "Ubuntu, sans-serif, monospace";
					menuButton.style.cursor = "pointer";
					let menuOpen = false;
					
					function toggleMenu() {
						term.api.log("Menu clicked");
						if (menuOpen) {
							term.api.log("Closing menu");
							document.getElementById("wm-menu").remove();
							menuOpen = false;
							menuButton.textContent = "MENU";
							return;
						}
						menuButton.textContent = "EXIT";
						
						term.api.log("Opening menu");
						const menu = services.graphicsmgrs.api.createRectangle(0, screenHeight * 0.04, screenWidth, screenHeight * 0.96, colors.darkTransparent);
                        menu.style.zIndex = "999";
						
						const execDir = services.fsrws.api.getItemByPath("onfsRoot/exec");
						let appList = [];
						for (let i in execDir.content) {
							const item = execDir.content[i];
							if (item.type === "file" && item.extension === "apn") {
								let application = AuroraONFSApplicationFile.getApplicationFromFile(item);
								appList.push(application);
							}
						}
						
						let menuAppListYOffset = 0;
						let menuAppListXOffset = 0;
						for (let i in appList) {
							const listEntry = services.graphicsmgrs.api.createTextualElement(15 + menuAppListXOffset, menuAppListYOffset, 20, "#ffffff", appList[i].name, "#00000000", menu);
							listEntry.style.cursor = "pointer";
                            listEntry.style.fontFamily = "Ubuntu, sans-serif, monospace";
							menuAppListYOffset += 20;
							if (menuAppListYOffset > screenWidth * 0.75) {
								menuAppListYOffset = 0;
								menuAppListXOffset += 200;
							}
							listEntry.addEventListener("click", () => {
								const process = services.processmgrs.api.createProcess(appList[i]);
								services.processmgrs.api.startProcess(process);
                                toggleMenu();
							});
						}
						menuAppListYOffset = 0;

                        const helpText = services.graphicsmgrs.api.createTextualElement(15, screenHeight * 0.96 - 35, 20, "#ffffff", `Click on an application name to run it. You are using ${services.sysinfos.api.getKernelName()} v${services.sysinfos.api.getKernelVersion()} and Wingman v${process.application.version}.`, "#00000000", menu);
                        helpText.style.fontFamily = "Ubuntu, sans-serif, monospace";
						menu.id = "wm-menu";
						menuOpen = true;
					}
					
					menuButton.addEventListener("click", toggleMenu);

                    let highestWinZIndex = 0;
                    process.deskapi = {
                        createWindow: (title, content, sizeX = 500, sizeY = 400, posX = screenWidth / 2 - sizeX / 2, posY = screenHeight / 2 - sizeY / 2) => {
                            const titlebar = document.createElement("div");
                            titlebar.style.width = "calc(100% - 6px)";
                            titlebar.style.height = `${screenHeight * 0.025 - 3}px`;
                            titlebar.style.backgroundColor = colors.darkTransparent;
                            titlebar.style.padding = "3px";
                            titlebar.style.display = "flex";
                            titlebar.style.alignItems = "center";
                            titlebar.style.justifyContent = "space-between";
                            titlebar.style.userSelect = "none";
                            titlebar.style.backdropFilter = "blur(3px)";

                            const titleElement = document.createElement("span");
                            titleElement.textContent = title;
                            titleElement.style.fontFamily = "Ubuntu, sans-serif, monospace";
                            titleElement.style.fontSize = `${screenHeight * 0.015}px`;

                            const closeButton = document.createElement("span");
                            closeButton.textContent = "X";
                            closeButton.style.fontFamily = "Ubuntu, sans-serif, monospace";
                            closeButton.style.fontSize = `${screenHeight * 0.015}px`;
                            closeButton.style.cursor = "pointer";
                            
                            titlebar.appendChild(titleElement);
                            titlebar.appendChild(closeButton);
                            
                            content.style.height = `${sizeY - screenHeight * 0.025 - 3}px`;

                            const winContent = document.createElement("div");
                            winContent.appendChild(titlebar);
                            winContent.appendChild(content);
                    
                            const newWindow = services.graphicsmgrs.api.createHTMLWindow(posX, posY, sizeX, sizeY, "#00000000", "#ffffff", winContent);
                            newWindow.style.borderRadius = "5px";
                            newWindow.style.border = "2px solid black";
                            newWindow.style.zIndex = highestWinZIndex + 1;
                            highestWinZIndex++;
                            newWindow.addEventListener("click", () => {
                                newWindow.style.zIndex = highestWinZIndex + 1;
                                highestWinZIndex++;
                            });


                            closeButton.addEventListener("click", () => {
                                if (newWindow.api && newWindow.api.onclose) {
                                    newWindow.api.onclose();
                                }
                                newWindow.remove();
                            });
                            titlebar.addEventListener("mousedown", () => {
                                newWindow.style.zIndex = highestWinZIndex + 1;
                                highestWinZIndex++;
                            });

                            // taken from https://www.w3schools.com/howto/howto_js_draggable.asp
                            function dragElement(element, bar) {
                                var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
                                
                                bar.onmousedown = dragMouseDown;

                                function dragMouseDown(e) {
                                    e = e || window.event;
                                    e.preventDefault();
                                    pos3 = e.clientX;
                                    pos4 = e.clientY;
                                    document.onmouseup = closeDragElement;
                                    document.onmousemove = elementDrag;
                                }

                                function elementDrag(e) {
                                    e = e || window.event;
                                    e.preventDefault();
                                    pos1 = pos3 - e.clientX;
                                    pos2 = pos4 - e.clientY;
                                    pos3 = e.clientX;
                                    pos4 = e.clientY;

                                    element.style.top = (element.offsetTop - pos2) + "px";
                                    element.style.left = (element.offsetLeft - pos1) + "px";
                                }

                                function closeDragElement() {
                                    document.onmouseup = null;
                                    document.onmousemove = null;
                                }
                            }
                                
                            dragElement(newWindow, titlebar);
                            
                            return newWindow;
                        },
                        removeWindow: (window) => {
                            window.remove();
                        }
                    };
                    
                    let welcomeWingman;
                    if (services.fsrws.api.getItemByPath("onfsRoot/exec/WingmanWelcome")) {
                        welcomeWingman = services.fsrws.api.getItemByPath("onfsRoot/exec/WingmanWelcome");
                    } else {
                        welcomeWingman = new Application("WingmanWelcome", "1.0.0");

                        welcomeWingman.api.createExecutableFromFunction((wprocess, wservices, wargv) => {
                            const deskproc = wservices.processmgrs.api.getDesktopEnvironmentProcess();
                            const deskapi = deskproc.deskapi;
                            
                            const windowContent = document.createElement("div");
                            windowContent.style.backgroundColor = "#ffffff";
                            windowContent.style.color = "#000000";

                            const bigWelcomeText = document.createElement("span");
                            bigWelcomeText.style.position = "absolute";
                            bigWelcomeText.style.fontFamily = "Ubuntu, sans-serif, monospace";
                            bigWelcomeText.textContent = "welcome";
                            bigWelcomeText.style.fontSize = "130px";
                            bigWelcomeText.style.width = "100%";
                            bigWelcomeText.style.textAlign = "center";
                            bigWelcomeText.style.color = "transparent";
                            bigWelcomeText.style.background = "linear-gradient(to bottom, #00000033, #00000001)";
                            bigWelcomeText.style.backgroundClip = "text";
                            bigWelcomeText.style.userSelect = "none";

                            windowContent.appendChild(bigWelcomeText);

                            const logoContainerOuter = document.createElement("div");
                            logoContainerOuter.style.width = "100%";
                            logoContainerOuter.style.display = "flex";
                            logoContainerOuter.style.justifyContent = "center";
                            logoContainerOuter.style.position = "absolute";
                            logoContainerOuter.style.top = "70px";
                            const logoContainerInner = document.createElement("div");
                            logoContainerInner.style.display = "flex";
                            const logo = document.createElement("img");
                            logo.src = "https://raw.githubusercontent.com/lilafian/aurora/master/img/wingmanlogo.png";
                            logo.style.width = "100px";
                            const logoText = document.createElement("span");
                            logoText.textContent = "WINGMAN";
                            logoText.style.fontFamily = "Ubuntu, sans-serif, monospace";
                            logoText.style.fontSize = "60px";
                            logoText.style.marginLeft = "15px";

                            logoContainerInner.appendChild(logo);
                            logoContainerInner.appendChild(logoText);
                            logoContainerOuter.appendChild(logoContainerInner);
                            windowContent.appendChild(logoContainerOuter);

                            deskapi.createWindow("Welcome to Wingman", windowContent, 600, 180); 
                        });

                        const execDir = services.fsrws.api.getItemByPath("onfsRoot/exec");
                        const appFile = new AuroraONFSApplicationFile("WingmanWelcome", welcomeWingman, services.fsrws.getFileSystemID);
                        execDir.api.addChild(appFile);
                    }
                    const welcomeWingmanProcess = services.processmgrs.api.createProcess(welcomeWingman);
                    setTimeout(() => {
                        services.processmgrs.api.startProcess(welcomeWingmanProcess);
                    }, 1500);
                });
                return wingman;
            },
            createAteTerminalEmulator: () => {
                const ate = new Application("ate", "1.0.0");
                ate.api.createExecutableFromFunction((process, services, argv) => {
                    const deskproc = services.processmgrs.api.getDesktopEnvironmentProcess();
                    const deskapi = deskproc.deskapi;
                    
                    const newTerm = new SystemTerminal(`ate-${process.pid}-term`);
                    newTerm.api.invisibleInit();

                    const termElement = document.createElement("div");
                    termElement.style.backgroundColor = "black";
                    termElement.appendChild(newTerm.element);

                    const shellFile = services.fsrws.api.getItemByPath("onfsRoot/exec/AuroraShell");
                    const shell = AuroraONFSApplicationFile.getApplicationFromFile(shellFile);
                    const shellProc = services.processmgrs.api.createProcess(shell);
                    services.processmgrs.api.startProcess(shellProc, [], newTerm);

                    const sSizeX = services.graphicsmgrs.api.getScreenWidth();
                    const sSizeY = services.graphicsmgrs.api.getScreenHeight();
                    const win = deskapi.createWindow("ate", termElement, sSizeX * 0.75, sSizeY * 0.75);
                    win.api = {
                        onclose: () => {
                            newTerm.api.destroy();
                        }
                    }
                });
                return ate;
            },
            init: async (terminal) => {
                this.terminal = terminal;
                this.terminal.api.log(`${name} kernel v${version} started\n\n`);
                this.terminal.api.log(`Changing id of terminal ${this.terminal.id} to ${this.name}-kernelt\n`);
                this.terminal.id = `${this.name}-kernelt`;
                this.terminal.api.log(`Kernel terminal is now ${this.terminal.id}\n\n`);
                
                this.api.initializeFileSystem(true);

                this.api.createServices();
                for (let i in this.registeredServices) {
                    this.terminal.api.log(`Service ${this.registeredServices[i].name} is registered\n`);
                    this.terminal.api.log(`Freezing service object for ${this.registeredServices[i].name}\n`);
                    Object.freeze(this.registeredServices[i]);
                }
                
                this.api.startTests();

                
                if (!this.fileSystem.api.getItemByPath("onfsRoot/exec/AuroraShell")) {
                    const sysExec = this.fileSystem.api.getItemByPath("onfsRoot/exec");
                    const shell = this.api.createShell();
                    const appFile = new AuroraONFSApplicationFile("AuroraShell", shell, this.fileSystem.id);
                    sysExec.api.addChild(appFile);
                }
                const shellFile = this.fileSystem.api.getItemByPath("onfsRoot/exec/AuroraShell");

                const shellApplication = AuroraONFSApplicationFile.getApplicationFromFile(shellFile);
                const shellProc = this.api.createProcess(shellApplication);
                this.api.startProcess(shellProc);

                if (!this.fileSystem.api.getItemByPath("onfsRoot/exec/deskEnv")) {
                    const exec = this.fileSystem.api.getItemByPath("onfsRoot/exec");
                    const wingman = this.api.createWingmanDeskEnv();
                    const appFile = new AuroraONFSApplicationFile("deskEnv", wingman, this.fileSystem.id);
                    exec.api.addChild(appFile);
                }

                if (!this.fileSystem.api.getItemByPath("onfsRoot/exec/ate")) {
                    const exec = this.fileSystem.api.getItemByPath("onfsRoot/exec");
                    const ate = this.api.createAteTerminalEmulator();
                    const appFile = new AuroraONFSApplicationFile("ate", ate, this.fileSystem.id);
                    exec.api.addChild(appFile);
                }
            }
        };
    }
}

class SystemLoader {
    constructor(kernel, name, version) {
        this.kernel = kernel
        this.name = name;
        this.version = version;
        this.terminal = new SystemTerminal(`${name}-systemloadert`);
        this.api = {
            boot: () => {
                this.terminal.api.init();
                this.terminal.api.log(`${this.name} v${this.version}\n`);
                this.terminal.api.log(`Loading kernel ${this.kernel.name} (version ${this.kernel.version})\n\n`);
                this.kernel.api.init(this.terminal);
            }
        };
    }
}

const AuroraSystemKernel = new SystemKernel("Aurora", "0.2.0");
const AuroraSystemLoader = new SystemLoader(AuroraSystemKernel, "AuroraSysLoader", "1.0.0");
AuroraSystemLoader.api.boot();

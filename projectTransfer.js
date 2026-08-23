import { createProjectExport, parseProjectExport, projectToPlainText } from './projectFormat.js';

function createProjectTransfer({
    projectState,
    onProjectImported,
    showAlert = message => globalThis.alert(message),
    fetchImpl = (...args) => globalThis.fetch(...args)
}) {
    function download(content, mimeType, filename) {
        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    function exportFilename(project, extension) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeTitle = project.title.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `ProjectExport_${safeTitle}_${timestamp}.${extension}`;
    }

    function exportProjectAsText(projectId) {
        const project = projectState.getProject(projectId);
        if (!project) return false;

        download(
            projectToPlainText(project),
            'text/plain;charset=utf-8',
            exportFilename(project, 'txt')
        );
        console.log(`Exported project as TEXT: ${project.title}`);
        return true;
    }

    function exportProjectAsJson(projectId) {
        const project = projectState.getProject(projectId);
        if (!project) return false;

        try {
            download(
                JSON.stringify(createProjectExport(project), null, 2),
                'application/json;charset=utf-8',
                exportFilename(project, 'json')
            );
            console.log(`Exported project as JSON: ${project.title}`);
            return true;
        } catch (error) {
            console.error('Error exporting project as JSON:', error);
            showAlert('Failed to export project as JSON. Check console for details.');
            return false;
        }
    }

    function displayExportOptions(projectId, buttonElement) {
        document.getElementById('export-options-menu')?.remove();

        const menu = document.createElement('div');
        menu.id = 'export-options-menu';
        menu.className = 'export-options-menu';

        const textButton = document.createElement('button');
        textButton.textContent = 'Export Text';
        textButton.onclick = event => {
            event.stopPropagation();
            exportProjectAsText(projectId);
            menu.remove();
        };

        const jsonButton = document.createElement('button');
        jsonButton.textContent = 'Export JSON';
        jsonButton.onclick = event => {
            event.stopPropagation();
            exportProjectAsJson(projectId);
            menu.remove();
        };

        menu.append(textButton, jsonButton);
        const rect = buttonElement.getBoundingClientRect();
        Object.assign(menu.style, {
            position: 'absolute',
            top: `${rect.bottom + window.scrollY}px`,
            left: `${rect.left + window.scrollX}px`,
            zIndex: '1000'
        });
        document.body.appendChild(menu);
        closeOnOutsideClick(menu, buttonElement);
    }

    function handleExportProject(projectId, event) {
        displayExportOptions(projectId, event.currentTarget);
    }

    async function processImportedData(jsonDataString, sourceDescription) {
        const parsed = parseProjectExport(jsonDataString);
        if (!parsed.ok) {
            console.error(`Import rejected from ${sourceDescription}:`, parsed.error);
            showAlert(`Import failed from ${sourceDescription}: ${parsed.error.message}`);
            return false;
        }

        const newProject = projectState.addProjectData(parsed.value.title, parsed.value.data);
        onProjectImported(newProject.id);
        console.log(`Imported project ${newProject.id} from ${sourceDescription}`);
        return true;
    }

    function handleImportFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = event => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = readEvent => {
                processImportedData(readEvent.target.result, `file "${file.name}"`);
            };
            reader.onerror = error => {
                console.error('Error reading file:', error);
                showAlert(`Error reading file: ${error.message}`);
            };
            reader.readAsText(file);
        };
        input.click();
    }

    async function importProjectFromUrl(url, sourceDescription) {
        console.log(`Attempting to import project from ${sourceDescription}: ${url}`);
        try {
            const response = await fetchImpl(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
            }
            return await processImportedData(await response.text(), sourceDescription);
        } catch (error) {
            console.error(`Error fetching or processing ${sourceDescription} from ${url}:`, error);
            showAlert(`Failed to import from ${sourceDescription}: ${error.message}. Check the URL and network connection.`);
            return false;
        }
    }

    async function handleImportFromUrl() {
        const url = globalThis.prompt('Enter the URL of the project JSON file:');
        if (!url) return;
        await importProjectFromUrl(url, `URL "${url}"`);
    }

    function displayImportOptions(buttonElement) {
        document.getElementById('import-options-menu')?.remove();
        document.getElementById('export-options-menu')?.remove();

        const menu = document.createElement('div');
        menu.id = 'import-options-menu';
        menu.className = 'import-options-menu';

        const fileButton = document.createElement('button');
        fileButton.textContent = 'Import File';
        fileButton.onclick = event => {
            event.stopPropagation();
            handleImportFromFile();
            menu.remove();
        };

        const urlButton = document.createElement('button');
        urlButton.textContent = 'Import URL';
        urlButton.onclick = event => {
            event.stopPropagation();
            handleImportFromUrl();
            menu.remove();
        };

        menu.append(fileButton, urlButton);
        const rect = buttonElement.getBoundingClientRect();
        Object.assign(menu.style, {
            position: 'absolute',
            top: `${rect.bottom + window.scrollY + 2}px`,
            left: `${rect.left + window.scrollX}px`,
            zIndex: '1000'
        });
        document.body.appendChild(menu);
        closeOnOutsideClick(menu, buttonElement);
    }

    function closeOnOutsideClick(menu, buttonElement) {
        const clickOutsideHandler = event => {
            if (!menu.contains(event.target) && event.target !== buttonElement) {
                menu.remove();
                document.removeEventListener('click', clickOutsideHandler, true);
            }
        };
        document.addEventListener('click', clickOutsideHandler, true);
    }

    return {
        displayImportOptions,
        handleExportProject,
        importProjectFromUrl,
        processImportedData
    };
}

export { createProjectTransfer };

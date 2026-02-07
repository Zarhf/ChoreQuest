const DriveAPI = {
    
    // Check if the DB file exists (in my drive or shared with me)
    async findDBFile() {
        try {
            // Search in owner's drive first
            let response = await gapi.client.drive.files.list({
                q: `name = '${CONFIG.DB_FILENAME}' and trashed = false`,
                fields: 'files(id, name, owners, shared)',
                spaces: 'drive'
            });
            
            let files = response.result.files;
            
            // If not found, search specifically in shared files
            if (!files || files.length === 0) {
                response = await gapi.client.drive.files.list({
                    q: `name = '${CONFIG.DB_FILENAME}' and trashed = false`,
                    fields: 'files(id, name, owners, shared)',
                    spaces: 'drive',
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true,
                });
                files = response.result.files;
            }

            if (files && files.length > 0) {
                return files[0].id;
            } else {
                return null;
            }
        } catch (err) {
            console.error('Error finding DB file:', err);
            return null;
        }
    },

    // Share the file with another Google user
    async shareFile(fileId, email) {
        try {
            await gapi.client.drive.permissions.create({
                fileId: fileId,
                resource: {
                    'type': 'user',
                    'role': 'writer',
                    'emailAddress': email
                }
            });
            return true;
        } catch (err) {
            console.error('Error sharing file:', err);
            throw err;
        }
    },

    // Create the DB file
    async createDBFile(initialData) {
        try {
            const fileContent = JSON.stringify(initialData);
            const file = new Blob([fileContent], {type: 'application/json'});
            const metadata = {
                'name': CONFIG.DB_FILENAME,
                'mimeType': 'application/json'
            };

            const accessToken = gapi.client.getToken().access_token;
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
            form.append('file', file);

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({'Authorization': 'Bearer ' + accessToken}),
                body: form
            });
            
            const data = await response.json();
            return data.id;
        } catch (err) {
            console.error('Error creating DB file:', err);
            throw err;
        }
    },

    // Read the DB file
    async readFile(fileId) {
        try {
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            return response.result;
        } catch (err) {
            console.error('Error reading file:', err);
            throw err;
        }
    },

    // Update the DB file
    async updateFile(fileId, data) {
        try {
            const fileContent = JSON.stringify(data);
            const file = new Blob([fileContent], {type: 'application/json'});
            const metadata = {
                'mimeType': 'application/json'
            };

            const accessToken = gapi.client.getToken().access_token;
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
            form.append('file', file);

            // Using fetch for upload as gapi doesn't support multipart upload easily for updates
            const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: new Headers({'Authorization': 'Bearer ' + accessToken}),
                body: form
            });
            
            return await response.json();
        } catch (err) {
            console.error('Error updating file:', err);
            throw err;
        }
    }
};
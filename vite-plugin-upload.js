import { formidable } from 'formidable';
import fs from 'fs';
import path from 'path';

export default function uploadPlugin() {
    const handler = async (req, res, next) => {
        if (req.url === '/upload' && req.method === 'POST') {
            const form = formidable({});

            try {
                const [_fields, files] = await form.parse(req);
                const uploadedFile = files.file?.[0];

                if (!uploadedFile) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ success: false, error: 'No file provided' }));
                    return;
                }

                const uploadsDir = path.resolve(process.cwd(), 'public/uploads');
                fs.mkdirSync(uploadsDir, { recursive: true });

                const originalName = uploadedFile.originalFilename || 'upload.bin';
                const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
                const filename = `${Date.now()}-${safeName}`;
                const targetPath = path.join(uploadsDir, filename);
                fs.copyFileSync(uploadedFile.filepath, targetPath);

                res.setHeader('Content-Type', 'application/json');
                res.end(
                    JSON.stringify({
                        success: true,
                        url: `/uploads/${filename}`,
                    })
                );
            } catch (err) {
                console.error('Local upload error:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
            return;
        }
        next();
    };

    return {
        name: 'upload-plugin',
        configureServer(server) {
            server.middlewares.use(handler);
        },
        configurePreviewServer(server) {
            server.middlewares.use(handler);
        },
    };
}

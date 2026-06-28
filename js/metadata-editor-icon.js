import editIconSvg from '../assets/edit-svgrepo-com.svg?raw';

export const EDIT_METADATA_ICON = editIconSvg
    .replace(/<\?xml[^>]*>/, '')
    .replace(/<!--.*?-->/s, '')
    .replace(/width="800px" height="800px"/, 'width="18" height="18"')
    .replace(/fill="#000000"/g, 'fill="currentColor"')
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
    .trim();

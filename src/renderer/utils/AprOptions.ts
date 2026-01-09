// APR rendering options
export interface AprOptions {
    aprMode?: boolean;
    progressPercent?: number;
    bookTitle?: string;
    authorUrl?: string;
    
    // Reveal options (checkboxes in modal)
    showSubplots?: boolean;  // Show all rings vs single Main Plot ring
    showActs?: boolean;      // Show act divisions vs full circle  
    showStatus?: boolean;    // Show real stage colors vs neutral gray
}

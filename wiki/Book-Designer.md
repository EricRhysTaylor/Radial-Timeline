# Book Designer

The **Book Designer** is a powerful setup utility that generates a complete manuscript skeleton tailored to your specifications. It creates scene files with pre-configured YAML frontmatter, distributes them across acts and subplots, and can even generate story beat templates.

This tool is perfect for starting a new project or rapidly prototyping a story structure.

## Accessing the Book Designer

You can open the Book Designer in two ways:
1.  **Command Palette**: Open the Command Palette (`Cmd/Ctrl + P`) and search for "Radial Timeline: Book designer".
2.  **Welcome Screen**: If your timeline is empty, click the "Book Designer" button on the Radial Timeline Welcome Screen.

## Workflow

The Book Designer modal guides you through three key configuration sections:

### 1. Location & Structure
*   **Target location**: The folder path where your new book files will be created (e.g., `Book 1`). The folder will be created if it doesn't exist. Otherwise root of the vault will be used.
*   **Scenes to generate**: The total number of scene files to create.
*   **Target book length**: Used for numbering distribution. For example, if you generate 10 scenes with a target length of 60, scenes will be numbered 1, 7, 13, etc., leaving gaps for future scenes.
*   **Acts to distribute scenes across**: Choose which acts (1, 2, 3) to populate. Scenes are distributed evenly across the selected acts.

### 2. Content Configuration
*   **Subplots**: Enter your subplots, one per line. Scenes will be assigned to these subplots in a round-robin fashion. Each scene will belong to only one subplot.
*   **Characters**: Enter your main characters, one per line. These will be added to the YAML frontmatter of the generated scenes.

### 3. Templates & Extras
*   **Scene template**: Choose between 'Base' (minimal) and 'Advanced' YAML templates. These templates are defined in the Radial Timeline settings. Note, the Advanced YAML can be customized.
*   **Generate Beats**: Optionally generate beat sheet files based on your selected beat system (e.g., Save the Cat, configured in Settings).

## Visual Preview
As you adjust the settings, the **Preview** donut chart updates in real-time to show you how your scenes will be distributed across acts and subplots. This helps you visualize the structure before generating any files. After generation, if you don't like what you get, open the Book designer and regenerate. 

## Generating Your Book
Once configured, click **Create Book**. The plugin will:
1.  Create the target folder.
2.  Generate individual markdown files for each scene, populated with the correct YAML frontmatter (scene number, act, subplot, characters, date).
3.  (Optional) Create beat sheet notes if selected.

You'll see a notification confirming the number of scenes and files created. Your Radial Timeline will immediately update to display your new story structure.


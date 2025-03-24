 # Manuscript Timeline Plugin Development Notes

## Project Structure
- All styles must go in `styles.css`
- All code changes must go in `main.ts`
- Documentation updates go in `README.md`

## Development Workflow
1. Make changes in local development environment
2. Test changes thoroughly
3. Update documentation in `README.md` if needed
4. Commit changes to a new fork on GitHub
5. Create Pull Request to main branch when ready
6. After PR is merged, changes will appear in Obsidian Community Plugin Market

## Important Reminders
- Keep `styles.css` and `main.ts` separate - don't mix styling with logic
- Update `README.md` whenever making significant changes to:
  - Features
  - Settings
  - Installation process
  - Usage instructions
  - Required metadata
  - Dependencies

## Code Organization
- Styles: `styles.css`
  - All CSS rules
  - Theme variables
  - Responsive design rules
  - Animation definitions

- Logic: `main.ts`
  - Plugin class
  - Settings interface
  - Timeline generation
  - Event handlers
  - Utility functions

## Documentation Updates
When making changes:
1. Update relevant sections in `README.md`
2. Keep documentation clear and concise
3. Include examples where helpful
4. Update screenshots if UI changes
5. Document any new settings or features

## GitHub Workflow
1. Create new fork for major revisions
2. Make changes in fork
3. Test thoroughly
4. Push changes to fork
5. Create Pull Request to main branch
6. Address any review comments
7. Merge when approved

## Testing Checklist
Before creating PR:
- [ ] Test in both light and dark themes
- [ ] Verify all features work as expected
- [ ] Check for any console errors
- [ ] Test with different scene configurations
- [ ] Verify documentation is up to date
- [ ] Test installation process
- [ ] Check compatibility with latest Obsidian version

## Release Process
1. Complete all changes in fork
2. Update version number
3. Update changelog
4. Create Pull Request
5. Address review comments
6. Merge to main
7. Wait for Community Plugin Market update

## Common Issues to Watch For
- Style conflicts between light/dark themes
- SVG rendering issues
- Performance with large numbers of scenes
- Memory leaks in event listeners
- Documentation consistency

## Future Improvements
- [ ] Add more customization options
- [ ] Improve performance for large timelines
- [ ] Add export/import functionality
- [ ] Enhance mobile responsiveness
- [ ] Add more visualization options
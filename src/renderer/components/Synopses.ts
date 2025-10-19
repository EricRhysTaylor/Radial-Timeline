export function serializeSynopsesToString(synopsesElements: SVGGElement[]): string {
    const synopsesContainer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    synopsesContainer.setAttribute("class", "synopses-container");
    synopsesElements.forEach(element => {
        synopsesContainer.appendChild(element);
    });
    const serializer = new XMLSerializer();
    return serializer.serializeToString(synopsesContainer);
}



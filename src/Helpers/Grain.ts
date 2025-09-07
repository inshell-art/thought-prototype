export function GrainFilter() {
    return `
        <filter id= "grainTex"
    filterUnits = "objectBoundingBox"
    width = "200%" height = "200%" >
        <feTurbulence
                type="fractalNoise"
    type = "fractalNoise"
    baseFrequency = "100"
    numOctaves = "10"
    result = "turbulence"
        />
        <feComposite operator="in" in="turbulence" in2 = "SourceAlpha" result = "composite" />
            <feColorMatrix in="composite" type = "luminanceToAlpha" />
                <feBlend in="SourceGraphic" in2 = "composite" mode = "color-burn" />
                    </filter>
                    </defs> `
}
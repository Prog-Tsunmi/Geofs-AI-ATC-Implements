// ==UserScript==
// @name         GeoFS AI (GPT) ATC
// @namespace    https://avramovic.info/
// @version      1.0.9
// @description  AI ATC for GeoFS using free PuterJS GPT API
// @author       Nemanja Avramovic
// @license      MIT
// @match        https://www.geo-fs.com/geofs.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geo-fs.com
// @grant        GM.getResourceText
// @grant        GM.getResourceUrl
// @resource     airports https://github.com/avramovic/geofs-ai-atc/raw/master/airports.json
// @resource     radiostatic https://github.com/avramovic/geofs-ai-atc/raw/master/radio-static.mp3
// ==/UserScript==

(function() {
    'use strict';

    // ========== CONFIGURATION ==========
    const CONFIG = {
        AUTO_POSITION_UPDATE_INTERVAL: 5000, // ms
        NEAREST_AIRPORT_UPDATE_INTERVAL: 5000, // ms
        NOTIFICATION_DURATION: 10000, // ms
        ATC_RESPONSE_TIMEOUT: 30000, // ms
        MAX_HISTORY_ENTRIES: 20,
        
        ALTITUDE_THRESHOLDS: {
            GROUND_MAX: 50, // ft (on ground)
            TOWER_MAX: 3000, // ft
            APPROACH_MAX: 18000, // ft
            CENTER_MIN: 18000 // ft
        },
        
        DISTANCE_THRESHOLDS: {
            TOWER_RANGE: 50, // nautical miles
            APPROACH_RANGE: 100, // nautical miles
        }
    };

    // ========== STATE MANAGEMENT ==========
    let state 
= {
        airports: null,
        radiostatic: null,
        tunedInAtc: null,
        currentPosition: null,
        controllers: {},
        context: {},
        oldNearest: null,
        puterLoaded: false,
        resourcesLoaded: false,
        isInitialized: false,
        speechRecognition: null
    };

    // ========== INITIALIZATION ==========
    async function initialize() {
        try {
            // Load resources
            await loadResources();
            
            // Load external scripts
            await loadExternalScripts();
            
            // Initialize UI
            initializeUI();
            
            // Start periodic updates
            startPeriodicUpdates();
            
            state
.isInitialized 
= true;
            console
.log('GeoFS AI ATC initialized successfully');
        } catch (error
) {
            console
.error('Failed to initialize GeoFS AI ATC:', error
);
            showError('Failed to initialize ATC system: ' + error
.message
);
        }
    }

    async function loadResources() {
        try {
            // Load airports data
            const airportsText 
= await GM.getResourceText("airports");
            state
.airports 
= JSON.parse(airportsText
);
            
            // Load radio static sound
            const radioUrl 
= await GM.getResourceUrl("radiostatic");
            state
.radiostatic 
= new Audio('data:audio/mp3;' + radioUrl
);
            state
.radiostatic
.loop 
= false;
            state
.radiostatic
.preload 
= 'auto';
            
            state
.resourcesLoaded 
= true;
        } catch (error
) {
            console
.warn('Failed to load some resources:', error
);
            // Continue with default airports if loading fails
            state
.airports 
= {};
        }
    }

    async function loadExternalScripts() {
        return new Promise((resolve, reject) => {
            const head 
= document
.querySelector('head');
            if (!head
) {
                reject(new Error('Head element not found'));
                return;
            }

            let scriptsLoaded 
= 0;
            const totalScripts 
= 2;

            function checkAllLoaded() {
                scriptsLoaded
++;
                if (scriptsLoaded 
=== totalScripts
) {
                    state
.puterLoaded 
= true;
                    resolve();
                }
            }

            // Load PuterJS
            if (typeof puter 
=== 'undefined') {
                const puterJS 
= document
.createElement('script');
                puterJS
.src 
= 'https://js.puter.com/v2/';
                puterJS
.onload 
= checkAllLoaded
;
                puterJS
.onerror = () => {
                    console
.warn('Failed to load PuterJS');
                    checkAllLoaded(); // Continue anyway
                };
                head
.appendChild(puterJS
);
            } else {
                state
.puterLoaded 
= true;
                scriptsLoaded
++;
            }

            // Load GrowlJS
            if (typeof vNotify 
=== 'undefined') {
                const growlJS 
= document
.createElement('script');
                growlJS
.src 
= 'https://cdn.jsdelivr.net/gh/avramovic/geofs-ai-atc@master/vanilla-notify.min.js';
                growlJS
.onload 
= checkAllLoaded
;
                growlJS
.onerror = () => {
                    console
.warn('Failed to load GrowlJS');
                    checkAllLoaded();
                };
                head
.appendChild(growlJS
);
                
                const growlCSS 
= document
.createElement('link');
                growlCSS
.href 
= 'https://cdn.jsdelivr.net/gh/avramovic/geofs-ai-atc@master/vanilla-notify.css';
                growlCSS
.rel 
= 'stylesheet';
                head
.appendChild(growlCSS
);
            } else {
                scriptsLoaded
++;
            }
        });
    }

    // ========== UI MANAGEMENT ==========
    function initializeUI() {
        const observer 
= new MutationObserver(() => {
            const menuList 
= document
.querySelector('div.geofs-ui-bottom');
            
            if (menuList 
&& !menuList
.querySelector('.geofs-atc-icon') && state
.resourcesLoaded
) {
                createATCButtons(menuList
);
                observer
.disconnect(); // Stop observing once buttons are created
            }
        });
        
        observer
.observe(document
.body
, { childList: true, subtree: true });
    }

    function createATCButtons(container) {
        // Create container for ATC controls
        const atcContainer 
= document
.createElement('div');
        atcContainer
.className 
= 'geofs-atc-container';
        atcContainer
.style
.display 
= 'flex';
        atcContainer
.style
.alignItems 
= 'center';
        atcContainer
.style
.gap 
= '8px';
        
        // Create buttons
        const buttons 
= [
            createButton('tunein', 'radio', 'Set ATC frequency', handleTuneInClick
),
            createButton('position', 'swap_horiz', 'Select ATC position', handlePositionClick
),
            createButton('atc', 'headset_mic', 'Talk to ATC (Ctrl/Cmd+Click for text)', handleATCClick
)
        ];
        
        buttons
.forEach(button => atcContainer
.appendChild(button
));
        
        // Create position indicator
        const positionIndicator 
= createPositionIndicator();
        atcContainer
.appendChild(positionIndicator
);
        
        container
.appendChild(atcContainer
);
    }

    function createButton(type, icon, title, clickHandler) {
        const button 
= document
.createElement('button');
        button
.className 
= `mdl-button mdl-js-button mdl-button--icon geofs-f-standard-ui geofs-${type}-icon`;
        button
.title 
= title
;
        button
.style
.minWidth 
= '48px';
        button
.style
.minHeight 
= '48px';
        
        const iconElement 
= document
.createElement('i');
        iconElement
.className 
= 'material-icons';
        iconElement
.textContent 
= icon
;
        button
.appendChild(iconElement
);
        
        button
.addEventListener('click', clickHandler
);
        return button
;
    }

    function createPositionIndicator() {
        const indicator 
= document
.createElement('div');
        indicator
.id 
= 'geofs-position-indicator';
        indicator
.className 
= 'geofs-position-indicator';
        indicator
.style
.cssText 
= `
            padding: 0 8px;
            font-size: 11px;
            font-weight: bold;
            border-radius: 3px;
            background: rgba(0, 0, 0, 0.3);
            color: #757575;
            min-width: 60px;
            text-align: center;
            text-transform: uppercase;
            user-select: none;
        `;
        indicator
.title 
= 'Current ATC Position';
        updatePositionIndicator();
        return indicator
;
    }

    function updatePositionIndicator() {
        const indicator 
= document
.getElementById('geofs-position-indicator');
        if (!indicator
) return;
        
        let positionText 
= state
.currentPosition 
? state
.currentPosition
.toUpperCase() : 'AUTO';
        indicator
.textContent 
= positionText
;
        
        // Color coding based on position
        const colors 
= {
            ground: '#4CAF50', // Green
            tower: '#2196F3',  // Blue
            approach: '#FF9800', // Orange
            departure: '#FF9800', // Orange (same as approach)
            center: '#9C27B0', // Purple
            auto: '#757575'    // Grey
        };
        
        const color 
= colors
[state
.currentPosition 
|| 'auto'];
        indicator
.style
.color 
= color
;
        indicator
.style
.border 
= `1px solid ${color}`;
    }

    // ========== EVENT HANDLERS ==========
    async function handleTuneInClick(e) {
        e
.preventDefault();
        e
.stopPropagation();
        
        try {
            const nearestAp 
= findNearestAirport();
            const defaultCode 
= nearestAp 
? nearestAp
.code 
: '';
            const input 
= prompt('Enter airport ICAO code (4 letters)', defaultCode
);
            
            if (input 
=== null) {
                showInfo('Frequency selection cancelled');
                return;
            }
            
            const apCode 
= input
.trim().toUpperCase();
            if (!apCode
) {
                showError('Please enter an airport code');
                return;
            }
            
            // Validate airport code
            const airportExists 
= validateAirportCode(apCode
);
            if (!airportExists
) {
                showError(`Airport "${apCode}" not found in GeoFS database`);
                return;
            }
            
            // Set frequency
            state
.tunedInAtc 
= apCode
;
            await initController(apCode
);
            autoSelectPosition();
            updatePositionIndicator();
            
            // Get airport info
            const airportInfo 
= getAirportInfo(apCode
);
            const apName 
= airportInfo 
? `${airportInfo.name} (${apCode})` : apCode
;
            
            showInfo(`Radio tuned to ${apName}. Position: ${state.currentPosition ? state.currentPosition.toUpperCase() : 'AUTO'}`, 'Frequency Set');
        } catch (error
) {
            console
.error('Error tuning frequency:', error
);
            showError('Failed to set frequency: ' + error
.message
);
        }
    }

    function handlePositionClick(e) {
        e
.preventDefault();
        e
.stopPropagation();
        
        if (!state
.tunedInAtc
) {
            showError('Please tune to an airport first!');
            return;
        }
        
        const positions 
= [
            { id: 'auto', name: 'Auto-select (based on altitude/distance)' },
            { id: 'ground', name: 'Ground Control' },
            { id: 'tower', name: 'Tower' },
            { id: 'approach', name: 'Approach/Departure' },
            { id: 'center', name: 'Area Control' }
        ];
        
        const positionList 
= positions
.map(pos => 
            `${pos.id === state.currentPosition ? '→ ' : '  '}${pos.name}`
        ).join('\n');
        
        const input 
= prompt(
            `Select ATC position for ${state.tunedInAtc}:\n\n${positionList}`,
            state
.currentPosition 
|| 'auto'
        );
        
        if (input 
=== null) return;
        
        const selected 
= input
.toLowerCase().trim();
        if (positions
.some(pos => pos
.id 
=== selected
)) {
            state
.currentPosition 
= selected 
=== 'auto' ? null : selected
;
            updatePositionIndicator();
            
            // Update context
            state
.context
[state
.tunedInAtc
] = state
.context
[state
.tunedInAtc
] || {};
            state
.context
[state
.tunedInAtc
].currentPosition 
= state
.currentPosition
;
            
            const positionName 
= positions
.find(p => p
.id 
=== (state
.currentPosition 
|| 'auto')).name
;
            showInfo(`ATC position set to: ${positionName}`);
        } else {
            showError('Invalid position. Please select from the list.');
        }
    }

    function handleATCClick(e) {
        e
.preventDefault();
        e
.stopPropagation();
        
        if (!state
.tunedInAtc
) {
            showError('No frequency set. Click the radio icon to set frequency!');
            return;
        }
        
        if (e
.ctrlKey 
|| e
.metaKey
) {
            // Text input mode
            const pilotMsg 
= prompt('Enter your message to ATC:');
            if (pilotMsg
) {
                processATCCall(pilotMsg
.trim());
            }
        } else {
            // Voice input mode
            startVoiceRecognition();
        }
    }

    // ========== AIRCRAFT STATE FUNCTIONS ==========
    function getAircraftState() {
        if (!unsafeWindow
.geofs 
|| !unsafeWindow
.geofs
.aircraft 
|| !unsafeWindow
.geofs
.aircraft
.instance
) {
            return null;
        }
        
        try {
            const aircraft 
= unsafeWindow
.geofs
.aircraft
.instance
;
            const animation 
= unsafeWindow
.geofs
.animation
;
            
            return {
                position: {
                    lat: aircraft
.lastLlaLocation 
? aircraft
.lastLlaLocation
[0] : 0,
                    lon: aircraft
.lastLlaLocation 
? aircraft
.lastLlaLocation
[1] : 0,
                    alt: aircraft
.lastLlaLocation 
? aircraft
.lastLlaLocation
[2] : 0
                },
                altitude: animation 
&& animation
.values 
? animation
.values
.altitude 
: 0,
                groundElevation: animation 
&& animation
.values 
? animation
.values
.groundElevationFeet 
: 0,
                groundContact: animation 
&& animation
.values 
? animation
.values
.groundContact 
=== 1 : false,
                airspeed: animation 
&& animation
.values 
? animation
.values
.airspeed 
: 0,
                verticalSpeed: animation 
&& animation
.values 
? animation
.values
.verticalSpeed 
: 0,
                heading: animation 
&& animation
.values 
? animation
.values
.heading 
: 0
            };
        } catch (error
) {
            console
.warn('Error getting aircraft state:', error
);
            return null;
        }
    }

    function isOnGround() {
        const state 
= getAircraftState();
        return state 
? state
.groundContact 
: false;
    }

    function getAltitude() {
        const state 
= getAircraftState();
        return state 
? state
.altitude 
: 0;
    }

    function getGroundAltitude() {
        const state 
= getAircraftState();
        if (!state
) return 0;
        return Math
.max(state
.altitude 
- state
.groundElevation 
- 50, 0);
    }

    // ========== AIRPORT FUNCTIONS ==========
    function validateAirportCode(code) {
        if (!unsafeWindow
.geofs 
|| !unsafeWindow
.geofs
.mainAirportList
) {
            return false;
        }
        return typeof unsafeWindow
.geofs
.mainAirportList
[code
] !== 'undefined';
    }

    function getAirportInfo(code) {
        if (!state
.airports 
|| !state
.airports
[code
]) {
            return null;
        }
        return state
.airports
[code
];
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const toRad = deg => deg 
* (Math
.PI / 180);
        
        const dLat 
= toRad(lat2 
- lat1
);
        const dLon 
= toRad(lon2 
- lon1
);
        
        const a 
= Math
.sin(dLat
/2) * Math
.sin(dLat
/2) +
                  Math
.cos(toRad(lat1
)) * Math
.cos(toRad(lat2
)) *
                  Math
.sin(dLon
/2) * Math
.sin(dLon
/2);
        const c 
= 2 * Math
.atan2(Math
.sqrt(a
), Math
.sqrt(1-a
));
        
        return (R * c
) / 1.852; // Convert to nautical miles
    }

    function findAirportDistance(code) {
        const aircraftState 
= getAircraftState();
        const airportData 
= unsafeWindow
.geofs
.mainAirportList
[code
];
        
        if (!aircraftState 
|| !airportData 
|| airportData
.length 
< 2) {
            return Infinity;
        }
        
        return haversine(
            aircraftState
.position
.lat
,
            aircraftState
.position
.lon
,
            airportData
[0],
            airportData
[1]
        );
    }

    function findNearestAirport() {
        if (!unsafeWindow
.geofs 
|| !unsafeWindow
.geofs
.mainAirportList
) {
            return null;
        }
        
        let nearestAirport 
= null;
        let minDistance 
= Infinity;
        
        try {
            for (let code 
in unsafeWindow
.geofs
.mainAirportList
) {
                const distance 
= findAirportDistance(code
);
                
                if (distance 
< minDistance 
&& distance 
< 500) { // Only consider airports within 500NM
                    minDistance 
= distance
;
                    nearestAirport 
= {
                        code: code
,
                        distance: distance
,
                        info: getAirportInfo(code
)
                    };
                }
            }
        } catch (error
) {
            console
.warn('Error finding nearest airport:', error
);
        }
        
        return nearestAirport
;
    }

    function calculateBearing(lat1, lon1, lat2, lon2) {
        const toRadians = deg => deg 
* (Math
.PI / 180);
        const toDegrees = rad => rad 
* (180 / Math
.PI);
        
        const dLon 
= toRadians(lon2 
- lon1
);
        const y 
= Math
.sin(dLon
) * Math
.cos(toRadians(lat2
));
        const x 
= Math
.cos(toRadians(lat1
)) * Math
.sin(toRadians(lat2
)) -
                  Math
.sin(toRadians(lat1
)) * Math
.cos(toRadians(lat2
)) * Math
.cos(dLon
);
        
        let bearing 
= toDegrees(Math
.atan2(y
, x
));
        return (bearing 
+ 360) % 360; // Normalize to 0-360
    }

    function getRelativeDirection(airportLat, airportLon, airplaneLat, airplaneLon) {
        const bearing 
= calculateBearing(airportLat
, airportLon
, airplaneLat
, airplaneLon
);
        
        const directions 
= [
            { range: [337.5, 22.5], name: "north" },
            { range: [22.5, 67.5], name: "northeast" },
            { range: [67.5, 112.5], name: "east" },
            { range: [112.5, 157.5], name: "southeast" },
            { range: [157.5, 202.5], name: "south" },
            { range: [202.5, 247.5], name: "southwest" },
            { range: [247.5, 292.5], name: "west" },
            { range: [292.5, 337.5], name: "northwest" }
        ];
        
        for (let dir 
of directions
) {
            let [start
, end
] = dir
.range
;
            if (start 
> end
) {
                // Handle wrap-around (north)
                if (bearing 
>= start 
|| bearing 
< end
) {
                    return dir
.name
;
                }
            } else if (bearing 
>= start 
&& bearing 
< end
) {
                return dir
.name
;
            }
        }
        return "north";
    }

    // ========== ATC POSITION LOGIC ==========
    function autoSelectPosition() {
        if (!state
.tunedInAtc
) return;
        
        const altitude 
= getAltitude();
        const groundAlt 
= getGroundAltitude();
        const onGround 
= isOnGround();
        const distance 
= findAirportDistance(state
.tunedInAtc
);
        
        // If position is manually set, don't auto-select
        if (state
.currentPosition 
&& state
.currentPosition 
!== 'auto') {
            return;
        }
        
        let newPosition 
= null;
        
        if (onGround 
&& groundAlt 
< CONFIG.ALTITUDE_THRESHOLDS.GROUND_MAX) {
            // On ground, at airport
            newPosition 
= 'ground';
        } else if (altitude 
< CONFIG.ALTITUDE_THRESHOLDS.TOWER_MAX && 
                   distance 
<= CONFIG.DISTANCE_THRESHOLDS.TOWER_RANGE) {
            // Within tower airspace
            newPosition 
= 'tower';
        } else if (altitude 
< CONFIG.ALTITUDE_THRESHOLDS.APPROACH_MAX && 
                   distance 
<= CONFIG.DISTANCE_THRESHOLDS.APPROACH_RANGE) {
            // Within approach/departure airspace
            newPosition 
= 'approach';
        } else if (altitude 
>= CONFIG.ALTITUDE_THRESHOLDS.CENTER_MIN) {
            // High altitude, en-route
            newPosition 
= 'center';
        } else {
            // Default to tower if within reasonable range
            newPosition 
= distance 
<= 100 ? 'tower' : 'center';
        }
        
        // Update context
        state
.context
[state
.tunedInAtc
] = state
.context
[state
.tunedInAtc
] || {};
        state
.context
[state
.tunedInAtc
].currentPosition 
= newPosition
;
        state
.currentPosition 
= newPosition
;
    }

    // ========== CONTROLLER MANAGEMENT ==========
    async function initController(apCode) {
        if (!state
.controllers
[apCode
]) {
            state
.controllers
[apCode
] = {
                ground: null,
                tower: null,
                approach: null,
                center: null,
                lastUpdated: Date
.now()
            };
            
            try {
                // Load controller profiles for different positions
                const positions 
= ['ground', 'tower', 'approach', 'center'];
                for (let position 
of positions
) {
                    await loadControllerProfile(apCode
, position
);
                }
            } catch (error
) {
                console
.warn(`Error loading controller profiles for ${apCode}:`, error
);
            }
        }
    }

    async function loadControllerProfile(apCode, position) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const seed = `${apCode}-${position}-${date}`;
            
            const response = await fetch(`https://randomuser.me/api/?gender=male&nat=us,ca,gb,au&seed=${seed}`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            if (data.results && data.results[0]) {
                state.controllers[apCode][position] = data.results[0];
            }
        } catch (error) {
            console.warn(`Failed to load ${position} controller for ${apCode}:`, error);
            // Use fallback controller data
            state.controllers[apCode][position] = createFallbackController(apCode, position);
        }
    }

    function createFallbackController(apCode, position) {
        const names 
= {
            ground: ['John', 'Mike', 'David'],
            tower: ['Robert', 'James', 'Thomas'],
            approach: ['William', 'Charles', 'Richard'],
            center: ['Michael', 'Christopher', 'Daniel']
        };
        
        const namePool 
= names
[position
] || names
.tower
;
        const firstName 
= namePool
[Math
.floor(Math
.random() * namePool
.length
)];
        
        return {
            name: { first: firstName
, last: 'Controller' },
            location: { city: 'Control Center', country: 'US' },
            picture: { thumbnail: '' }
        };
    }

    function getCurrentController() {
        if (!state
.tunedInAtc 
|| !state
.controllers
[state
.tunedInAtc
]) {
            return null;
        }
        
        const position 
= state
.currentPosition 
|| 'tower';
        return {
            controller: state
.controllers
[state
.tunedInAtc
][position
],
            position: position
        
};
    }

    // ========== VOICE RECOGNITION ==========
    function startVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window 
|| 'SpeechRecognition' in window
)) {
            showError('Speech recognition not supported in this browser. Use Ctrl+Click for text input.');
            return;
        }
        
        const SpeechRecognition 
= window
.SpeechRecognition 
|| window
.webkitSpeechRecognition
;
        
        if (state
.speechRecognition
) {
            state
.speechRecognition
.stop();
        }
        
        state
.speechRecognition 
= new SpeechRecognition();
        state
.speechRecognition
.continuous 
= false;
        state
.speechRecognition
.interimResults 
= false;
        state
.speechRecognition
.lang 
= 'en-US';
        state
.speechRecognition
.maxAlternatives 
= 1;
        
        state
.speechRecognition
.onstart = () => {
            showInfo('Listening... Speak now', 'Voice Recognition');
        };
        
        state
.speechRecognition
.onresult = (event) => {
            const transcript 
= event
.results
[0][0].transcript
;
            if (transcript 
&& transcript
.trim()) {
                processATCCall(transcript
.trim());
            } else {
                showError('No speech detected. Please try again.');
            }
        };
        
        state
.speechRecognition
.onerror = (event) => {
            console
.error('Speech recognition error:', event
.error
);
            showError(`Speech recognition error: ${event.error}. Use Ctrl+Click for text input.`);
        };
        
        state
.speechRecognition
.onend = () => {
            state
.speechRecognition 
= null;
        };
        
        try {
            state
.speechRecognition
.start();
        } catch (error
) {
            showError('Failed to start speech recognition: ' + error
.message
);
        }
    }

    // ========== ATC COMMUNICATION ==========
    async function processATCCall(pilotMsg) {
        if (!state
.tunedInAtc
) {
            showError('No ATC frequency tuned. Please tune to an airport first.');
            return;
        }
        
        // Check for position switch requests
        const requestedPosition 
= detectPositionSwitch(pilotMsg
);
        if (requestedPosition
) {
            handlePositionSwitch(requestedPosition
, pilotMsg
);
            return;
        }
        
        // Initialize context if needed
        state
.context
[state
.tunedInAtc
] = state
.context
[state
.tunedInAtc
] || {
            history: [],
            currentPosition: state
.currentPosition
,
            aircraftInfo: getAircraftInfo()
        };
        
        // Add message to history
        const context 
= state
.context
[state
.tunedInAtc
];
        context
.history
.push({
            role: 'pilot',
            message: pilotMsg
,
            timestamp: new Date().toISOString(),
            position: context
.currentPosition
        
});
        
        // Keep history limited
        if (context
.history
.length 
> CONFIG.MAX_HISTORY_ENTRIES) {
            context
.history 
= context
.history
.slice(-CONFIG.MAX_HISTORY_ENTRIES);
        }
        
        // Show pilot message
        showPilotMessage(pilotMsg
);
        
        // Play radio static
        playRadioStatic();
        
        // Generate ATC response
        try {
            const atcResponse 
= await generateATCResponse(pilotMsg
, context
);
            
            // Add ATC response to history
            context
.history
.push({
                role: 'atc',
                message: atcResponse
,
                timestamp: new Date().toISOString(),
                position: context
.currentPosition
            
});
            
            // Display and speak response
            showATCResponse(atcResponse
);
            speakATCResponse(atcResponse
);
            
            // Check if ATC suggests position switch
            checkForPositionSwitchSuggestion(atcResponse
);
            
        } catch (error
) {
            console
.error('Error generating ATC response:', error
);
            showError('Failed to get ATC response. Please try again.');
            
            // Fallback response
            const fallbackResponse 
= getFallbackResponse(pilotMsg
);
            showATCResponse(fallbackResponse
);
            speakATCResponse(fallbackResponse
);
        }
    }

    function detectPositionSwitch(message) {
        const lowerMsg 
= message
.toLowerCase();
        
        const switchPatterns 
= [
            { pattern: /(?:switch to|contact|request) (?:ground|ground control)/i, position: 'ground' },
            { pattern: /(?:switch to|contact|request) (?:tower)/i, position: 'tower' },
            { pattern: /(?:switch to|contact|request) (?:approach|departure)/i, position: 'approach' },
            { pattern: /(?:switch to|contact|request) (?:center|area control)/i, position: 'center' },
            { pattern: /(?:with) (?:ground)/i, position: 'ground' },
            { pattern: /(?:with) (?:tower)/i, position: 'tower' }
        ];
        
        for (let pattern 
of switchPatterns
) {
            if (pattern
.pattern
.test(lowerMsg
)) {
                return pattern
.position
;
            }
        }
        
        return null;
    }

    function handlePositionSwitch(requestedPosition, originalMessage) {
        // Update position
        state
.currentPosition 
= requestedPosition
;
        updatePositionIndicator();
        
        // Update context
        state
.context
[state
.tunedInAtc
] = state
.context
[state
.tunedInAtc
] || {};
        state
.context
[state
.tunedInAtc
].currentPosition 
= requestedPosition
;
        
        // Clean the message
        const cleanMessage 
= originalMessage
            
.replace(/(?:switch to|contact|request|with) (?:ground|tower|approach|center|departure|area control)/gi, '')
            .trim();
        
        if (cleanMessage
) {
            // If there's still a message after cleaning, process it
            showInfo(`Switched to ${requestedPosition.toUpperCase()} control`, 'Position Changed');
            setTimeout(() => processATCCall(cleanMessage
), 1000);
        } else {
            // If only switch request, ask for message
            showInfo(`Now connected to ${requestedPosition.toUpperCase()} control. What is your message?`, 'Position Changed');
        }
    }

    async function generateATCResponse(pilotMsg, context) {
        if (!state
.puterLoaded
) {
            throw new Error('AI service not available');
        }
        
        const controllerInfo 
= getCurrentController();
        const atcPosition 
= controllerInfo 
? controllerInfo
.position 
: 'tower';
        const aircraftState 
= getAircraftState();
        
        // Build prompt
        let prompt 
= buildATCPrompt(pilotMsg
, context
, atcPosition
, aircraftState
);
        
        // Get response from AI
        const response 
= await puter
.gpt
.complete(prompt
);
        return response
.trim();
    }

    function buildATCPrompt(pilotMsg, context, atcPosition, aircraftState) {
        let prompt 
= `You are an ATC controller at ${state.tunedInAtc} airport, working as ${atcPosition.toUpperCase()} control.\n\n`;
        
        // Add position-specific context
        prompt 
+= getPositionSpecificInstructions(atcPosition
);
        
        // Add aircraft state
        prompt 
+= `\nCurrent aircraft situation:\n`;
        prompt 
+= getAircraftSituationText(aircraftState
, state
.tunedInAtc
);
        
        // Add conversation history
        prompt 
+= `\nRecent communication:\n`;
        const recentHistory 
= context
.history
.slice(-4);
        recentHistory
.forEach(entry => {
            const role 
= entry
.role 
=== 'pilot' ? 'Pilot' : `ATC (${entry.position})`;
            prompt 
+= `${role}: ${entry.message}\n`;
        });
        
        prompt 
+= `\nPilot: ${pilotMsg}\n`;
        prompt 
+= `ATC (${atcPosition}):`;
        
        return prompt
;
    }

    function getPositionSpecificInstructions(position) {
        const instructions 
= {
            ground: `As GROUND CONTROL, you handle:
- Taxi instructions and clearances
- Gate and parking assignments
- Ground traffic coordination
- Pushback and startup clearances
- Airport surface movement
Use phrases like: "Taxi to runway via...", "Hold position", "Gate 3 via taxiway Alpha"`,

            tower: `As TOWER CONTROL, you handle:
- Takeoff and landing clearances
- Runway assignments
- Local traffic coordination
- Pattern operations
- Wake turbulence advisories
Use phrases like: "Cleared for takeoff", "Cleared to land", "Enter left downwind", "Number 2 following..."`,

            approach: `As APPROACH/DEPARTURE CONTROL, you handle:
- Arrival and departure sequencing
- Radar vectors
- Altitude and speed assignments
- Traffic separation
- Instrument approaches
Use phrases like: "Turn heading 270", "Descend and maintain 3000", "Contact tower 118.7", "Cleared ILS approach"`,

            center: `As AREA CONTROL, you handle:
- En-route traffic
- Altitude and route clearances
- Oceanic/remote area control
- Flight level changes
- Long-range navigation
Use phrases like: "Climb and maintain FL330", "Direct to WAYPOINT", "Report crossing", "Resume own navigation"`
        };
        
        return instructions
[position
] || instructions
.tower
;
    }

    function getAircraftSituationText(aircraftState, airportCode) {
        if (!aircraftState
) return 'Aircraft data unavailable';
        
        const distance 
= findAirportDistance(airportCode
);
        const onGround 
= aircraftState
.groundContact
;
        const agl 
= getGroundAltitude();
        
        let text 
= '';
        
        if (onGround 
&& agl 
< 50) {
            text 
+= `- Aircraft is ON GROUND at ${airportCode}\n`;
            text 
+= `- Altitude: ${Math.round(aircraftState.altitude)}ft MSL (${Math.round(agl)}ft AGL)\n`;
        } else {
            text 
+= `- Altitude: ${Math.round(aircraftState.altitude)}ft MSL\n`;
            text 
+= `- Distance from ${airportCode}: ${distance.toFixed(1)} NM\n`;
            text 
+= `- Heading: ${Math.round(aircraftState.heading)}°\n`;
            text 
+= `- Airspeed: ${Math.round(aircraftState.airspeed)} kts\n`;
            
            if (distance 
< 10) {
                text 
+= `- Position: In the vicinity of ${airportCode}\n`;
            } else {
                const airportData 
= unsafeWindow
.geofs
.mainAirportList
[airportCode
];
                if (airportData 
&& airportData
.length 
>= 2) {
                    const direction 
= getRelativeDirection(
                        airportData
[0], airportData
[1],
                        aircraftState
.position
.lat
, aircraftState
.position
.lon
                    
);
                    text 
+= `- Bearing: ${direction.toUpperCase()} of airport\n`;
                }
            }
        }
        
        return text
;
    }

    function getAircraftInfo() {
        try {
            const user 
= unsafeWindow
.geofs
.userRecord
;
            const aircraft 
= unsafeWindow
.geofs
.aircraft
.instance
.aircraftRecord
;
            
            return {
                callsign: user 
&& user
.id 
!== 0 ? user
.callsign 
: 'N12345',
                aircraftType: aircraft 
? aircraft
.name 
: 'General Aviation',
                pilotName: user 
&& user
.id 
!== 0 ? `${user.firstname} ${user.lastname}` : 'Private Pilot'
            };
        } catch (error
) {
            return {
                callsign: 'N12345',
                aircraftType: 'Aircraft',
                pilotName: 'Pilot'
            };
        }
    }

    function getFallbackResponse(pilotMsg) {
        const responses 
= [
            "Roger, standby.",
            "Copy that.",
            "Affirmative.",
            "Say again?",
            "Unable, traffic in the area.",
            "Wilco.",
            "Maintain current heading and altitude."
        ];
        
        return responses
[Math
.floor(Math
.random() * responses
.length
)];
    }

    function checkForPositionSwitchSuggestion(response) {
        const lowerResponse 
= response
.toLowerCase();
        
        if (lowerResponse
.includes('contact ground')) {
            state
.currentPosition 
= 'ground';
        } else if (lowerResponse
.includes('contact tower')) {
            state
.currentPosition 
= 'tower';
        } else if (lowerResponse
.includes('contact approach') || lowerResponse
.includes('contact departure')) {
            state
.currentPosition 
= 'approach';
        } else if (lowerResponse
.includes('contact center')) {
            state
.currentPosition 
= 'center';
        }
        
        if (state
.currentPosition
) {
            updatePositionIndicator();
        }
    }

    // ========== AUDIO FUNCTIONS ==========
    function playRadioStatic() {
        if (state
.radiostatic
) {
            try {
                state
.radiostatic
.currentTime 
= 0;
                state
.radiostatic
.volume 
= 0.3;
                state
.radiostatic
.play().catch(e => {
                    console
.debug('Radio static play failed (user may have blocked autoplay):', e
);
                });
            } catch (error
) {
                console
.debug('Error playing radio static:', error
);
            }
        }
    }

    function speakATCResponse(text) {
        if (!('speechSynthesis' in window
)) {
            return; // Text-to-speech not supported
        }
        
        try {
            const utterance 
= new SpeechSynthesisUtterance(text
);
            utterance
.rate 
= 1.0;
            utterance
.pitch 
= 1.0;
            utterance
.volume 
= 1.0;
            utterance
.lang 
= 'en-US';
            
            // Try to find a male voice
            const voices 
= speechSynthesis
.getVoices();
            const maleVoice 
= voices
.find(v => v
.name
.toLowerCase().includes('male') || v
.lang 
=== 'en-US');
            if (maleVoice
) {
                utterance
.voice 
= maleVoice
;
            }
            
            speechSynthesis
.speak(utterance
);
        } catch (error
) {
            console
.debug('Text-to-speech error:', error
);
        }
    }

    // ========== NOTIFICATION FUNCTIONS ==========
    function showError(message
, title 
= 'Error') {
        if (typeof vNotify 
!== 'undefined') {
            vNotify
.error({ text: message
, title: title
, visibleDuration: CONFIG.NOTIFICATION_DURATION });
        } else {
            console
.error(`${title}: ${message}`);
            alert(`${title}: ${message}`);
        }
    }

    function showInfo(message
, title 
= 'Information') {
        if (typeof vNotify 
!== 'undefined') {
            vNotify
.info({ text: message
, title: title
, visibleDuration: CONFIG.NOTIFICATION_DURATION });
        } else {
            console
.info(`${title}: ${message}`);
        }
    }

    function showPilotMessage(message) {
        const aircraftInfo 
= getAircraftInfo();
        if (typeof vNotify 
!== 'undefined') {
            vNotify
.success({ 
                text: message
, 
                title: `${aircraftInfo.aircraftType}: ${aircraftInfo.callsign}`,
                visibleDuration: CONFIG.NOTIFICATION_DURATION 
            });
        }
    }

    function showATCResponse(message) {
        const controllerInfo 
= getCurrentController();
        const position 
= controllerInfo 
? controllerInfo
.position
.toUpperCase() : 'ATC';
        const airport 
= state
.tunedInAtc 
|| 'Unknown';
        
        if (typeof vNotify 
!== 'undefined') {
            vNotify
.warning({ 
                text: message
, 
                title: `${airport} ${position}`,
                visibleDuration: CONFIG.NOTIFICATION_DURATION * 2 
            });
        }
    }

    // ========== PERIODIC UPDATES ==========
    function startPeriodicUpdates() {
        // Update nearest airport
        setInterval(() => {
            try {
                const airport 
= findNearestAirport();
                if (airport 
&& airport
.code 
!== state
.oldNearest
) {
                    const airportInfo 
= getAirportInfo(airport
.code
);
                    const apName 
= airportInfo 
? `${airportInfo.name} (${airport.code})` : airport
.code
;
                    
                    showInfo(`Now in range of ${apName}. Tune to ${airport.code} to communicate.`, 'Nearby Airport');
                    
                    state
.oldNearest 
= airport
.code
;
                    initController(airport
.code
);
                }
            } catch (error
) {
                console
.debug('Error in nearest airport update:', error
);
            }
        }, CONFIG.NEAREST_AIRPORT_UPDATE_INTERVAL);
        
        // Auto-update position
        setInterval(() => {
            if (state
.tunedInAtc 
&& (!state
.currentPosition 
|| state
.currentPosition 
=== 'auto')) {
                autoSelectPosition();
                updatePositionIndicator();
            }
        }, CONFIG.AUTO_POSITION_UPDATE_INTERVAL);
    }

    // ========== CLEANUP ==========
    function cleanup() {
        if (state
.speechRecognition
) {
            state
.speechRecognition
.stop();
            state
.speechRecognition 
= null;
        }
        
        if (state
.radiostatic
) {
            state
.radiostatic
.pause();
            state
.radiostatic 
= null;
        }
        
        if (window
.speechSynthesis 
&& window
.speechSynthesis
.speaking
) {
            window
.speechSynthesis
.cancel();
        }
    }

    // Add cleanup on page unload
    window
.addEventListener('beforeunload', cleanup
);

    // ========== START INITIALIZATION ==========
    // Wait for GeoFS to load
    if (document
.readyState 
=== 'loading') {
        document
.addEventListener('DOMContentLoaded', initialize
);
    } else {
        setTimeout(initialize
, 1000); // Give GeoFS time to load
    }

})();

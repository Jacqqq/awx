const channel = window.AirwallexWebViewChannel;
/**
 * @param {object} messageObject - The message object to be sent.
 */
function postToFlutter(messageObject) {
    if (channel && typeof channel.postMessage === 'function') {
        channel.postMessage(JSON.stringify(messageObject));
    } else {
        console.error('Flutter channel "AirwallexWebViewChannel" is not available.');
    }
}

/**
 * Handles errors by logging them and posting to Flutter.
 * @param {Error} error - The error object.
 */
function handleError(error) {
    const errorMessage = `JS SCA Setup Error: ${error.message || error}`;
    console.error(errorMessage);
    postToFlutter({ error: errorMessage });
}

document.addEventListener('DOMContentLoaded', () => {
    // This message signals to Flutter that the JS environment is fully set up.
    postToFlutter({ "event": "js_ready" }); 
});

/**
 * Initializes and mounts the Airwallex SCA (Strong Customer Authentication) verification component.
 * It sets up event listeners to communicate the SCA flow status back to Flutter.
 *
 * @async
 * @param {string} userEmail - The email address of the user.
 * @param {string} langKey - The language for the component (e.g., 'en', 'pl').
 * @param {string} env - The Airwallex environment (e.g., 'prod' or 'demo').
 * @param {string} authCode - The single-use authorization code.
 * @param {string} clientId - The client ID for your Airwallex application.
 * @param {string} codeVerifier - The PKCE code verifier string.
 * @param {string} scaSessionCode - The unique session code for this SCA attempt.
 * @returns {Promise<void>}
 * @throws {Error} Throws an error if initialization or element creation fails.
 */
window.startSca = async function (userEmail, langKey, env, authCode, clientId, codeVerifier, scaSessionCode) {
    try {

        const airwallexEnv = env === 'prod' ? 'prod' : 'demo';

        await window.AirwallexComponentsSDK.init({
            langKey: langKey,
            env: airwallexEnv,
            clientId: clientId,
            authCode: authCode,
            codeVerifier: codeVerifier,
            enabledElements: ['scaSetup', 'scaVerify'],
        });

        const sca = await window.AirwallexComponentsSDK.createElement('scaVerify', {
            userEmail: userEmail,
            scaSessionCode: scaSessionCode,
        });

        sca.mount('container-dom-id');

        sca.on('ready', () => {
            postToFlutter({ "log": "SCA Element is ready" });
        });

        sca.on('scaSetupSucceed', ({ mobileInfo }) => {
            postToFlutter({ "scaSetupSucceed": mobileInfo });
        });

        sca.on('verificationSucceed', (event) => {
            postToFlutter({ "scaToken": event.token });
        });

        sca.on('verificationFailed', (event) => {
            const reason = event.reason || event.error?.message || 'Unknown SCA failure';
            postToFlutter({ "error": `SCA Failed: ${reason}` });
        });

        sca.on('error', (event) => {
            const errMsg = event.error?.message || event.code || 'Unknown SCA element error';
            postToFlutter({ "error": `SCA Error: ${errMsg}` });
        });
        sca.on('cancel', () => {
            postToFlutter({ "log": "SCA cancelled." });
        });

    } catch (error) {
        handleError(error);
    }
};

/**
 * Clears the container and displays an iframe with card details or a PIN view.
 * This function performs a DOM manipulation action and does not return a value.
 *
 * @param {string} token - The authorization token (e.g., the scaToken from `startSca`).
 * @param {string} providerCardId - The unique identifier for the card.
 * @param {string} env - The Airwallex environment (e.g., 'prod' or 'demo').
 * @param {boolean} isPhysical - True if the card is physical, false if virtual.
 * @param {boolean} [isSingleUse=false] - (Optional) True if the virtual card is single-use.
 * @param {string} [langKey='en'] - (Optional) The language key.
 * @returns {void}
 */
window.showDetails = function (token, providerCardId, env, isPhysical, isSingleUse = false, langKey = 'en') {
    try {
        const container = document.getElementById('container-dom-id');
        container.innerHTML = '';

        postToFlutter({ "isphysical": isPhysical });
        let hashConfig;
        let urlPath;

        if (isPhysical === true) {
            urlPath = 'pin';
            hashConfig = {
                token: token,
                rules: {
                    '.pin': {
                        fontSize: '21px',
                        fontWeight: '500',
                        fontFamily: 'Inter',
                        color: '#1E3C63',
                    },
                },
            };
        } else {
            urlPath = 'details';
            hashConfig = {
                token: token,
                langKey: langKey,
                rules: {
                    '.details': {
                        fontFamily: 'Inter',
                    },
                    '.details__row': {
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '24px 20px 5px',
                    },
                    '.details__label': {
                        color: '#1E3C63',
                        fontSize: '18px',
                        fontWeight: '400',
                        lineHeight: '1.33',
                    },
                    '.details__value': {
                        color: '#1E3C63',
                        fontSize: '21px',
                        fontStyle: 'normal',
                        fontWeight: '500',
                        lineHeight: '1.33',
                        margin: '0',
                    },
                    '.details__tooltip': {
                        backgroundColor: '#1E3C63',
                        padding: '0 10px',
                        borderRadius: '3px',
                    },
                    '.details__content': {
                        display: 'block'
                    },
                    '.details__button svg': {
                        color: '#1E3C63',
                        height: '36px',
                        width: '36px',
                    },
                },
            };
        }

        const hashUri = encodeURIComponent(JSON.stringify(hashConfig));
        const airwallexHost = env === 'prod' ? 'www.airwallex.com' : 'demo.airwallex.com';
        const iframeUrl = `https://${airwallexHost}/issuing/pci/v2/${providerCardId}/${urlPath}#${hashUri}`;

        const iframe = document.createElement('iframe');
        iframe.src = iframeUrl;
        iframe.style.width = '100%';
        iframe.style.height = '500px';
        iframe.style.display = 'block';
        iframe.style.border = 'none';

        container.appendChild(iframe);
    } catch (error) {
        handleError(error);
    }
};

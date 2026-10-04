// Prices per country or region. Edit here; both language pages read from this table.
var PRICING = {
  EC: { setup: "$100", promoSetup: "$45", monthly: "$50", currency: "USD", perClient: "$17" },
  MX: { setup: "$1,900", promoSetup: "$855", monthly: "$950", currency: "MXN", perClient: "$317" },
  US: { setup: "$300", promoSetup: "$135", monthly: "$79", currency: "USD", perClient: "$26" },
  CA: { setup: "$300", promoSetup: "$135", monthly: "$79", currency: "USD", perClient: "$26" },
  EU: { setup: "$300", promoSetup: "$135", monthly: "$79", currency: "USD", perClient: "$26" },
  LATAM: { setup: "$100", promoSetup: "$45", monthly: "$50", currency: "USD", perClient: "$17" },
  OTHER: { setup: "$300", promoSetup: "$135", monthly: "$79", currency: "USD", perClient: "$26" }
};

// Launch promotion: 55% off the one-time payment in every country. After this date the page goes back to regular prices on its own.
var PROMO_ENDS = new Date("2026-10-31T23:59:59");
var PROMO_ACTIVE = new Date() <= PROMO_ENDS;

if (!PROMO_ACTIVE) {
  Object.keys(PRICING).forEach(function (code) {
    PRICING[code].promoSetup = PRICING[code].setup;
  });
  document.documentElement.classList.add("promo-over");
}

// Web app URL of the Google Apps Script that adds each lead to a private Google Sheet.
// It can only add rows; nobody can read the sheet through it. Leave empty to turn it off.
var LEADS_ENDPOINT = "https://script.google.com/macros/s/AKfycbzJpRfy53QABma5u1ClHHkknyP2mf0mxPX3gxob1EVbYIu_1EuNEXJdn0h-k3jfKJEP/exec";

var LATAM_COUNTRIES = ["AR", "BO", "BR", "CL", "CO", "CR", "CU", "DO", "GT", "HN", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE"];

var EUROPE_COUNTRIES = [
  "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU",
  "IE", "IS", "IT", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK"
];

var COUNTRY_STORAGE_KEY = "tupresenzia-country";
var DETECTED_STORAGE_KEY = "tupresenzia-detected";

var MX_TIMEZONES = [
  "America/Mexico_City", "America/Monterrey", "America/Tijuana", "America/Cancun",
  "America/Merida", "America/Chihuahua", "America/Hermosillo", "America/Mazatlan",
  "America/Matamoros", "America/Ojinaga", "America/Bahia_Banderas", "America/Ciudad_Juarez"
];

var US_TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Phoenix", "America/Anchorage", "America/Detroit", "America/Boise",
  "America/Juneau", "Pacific/Honolulu"
];

function regionFor(isoCountry) {
  if (isoCountry === "EC" || isoCountry === "MX" || isoCountry === "US" || isoCountry === "CA") {
    return isoCountry;
  }

  if (LATAM_COUNTRIES.indexOf(isoCountry) !== -1) {
    return "LATAM";
  }

  if (EUROPE_COUNTRIES.indexOf(isoCountry) !== -1) {
    return "EU";
  }

  return "OTHER";
}

function readStorage(name, key) {
  try {
    var value = window[name].getItem(key);
    return PRICING[value] ? value : null;
  } catch (error) {
    return null;
  }
}

function writeStorage(name, key, value) {
  try {
    window[name].setItem(key, value);
  } catch (error) {
    // Storage can be blocked; the value still applies for this visit.
  }
}

// Used only when the lookup by IP fails.
function guessFromTimeZone() {
  var timeZone = "";

  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (error) {
    timeZone = "";
  }

  if (timeZone === "America/Guayaquil" || timeZone === "Pacific/Galapagos") {
    return "EC";
  }

  if (MX_TIMEZONES.indexOf(timeZone) !== -1) {
    return "MX";
  }

  if (US_TIMEZONES.indexOf(timeZone) !== -1 || timeZone.indexOf("America/Indiana") === 0 || timeZone.indexOf("America/Kentucky") === 0) {
    return "US";
  }

  var fallback = document.documentElement.getAttribute("data-default-country");
  return PRICING[fallback] ? fallback : "EC";
}

// Asks a public service which country the visitor's IP belongs to.
function lookupCountryByIp(callback) {
  var finished = false;

  var finish = function (isoCountry) {
    if (!finished) {
      finished = true;
      callback(isoCountry);
    }
  };

  window.setTimeout(function () {
    finish(null);
  }, 2500);

  fetch("https://www.cloudflare.com/cdn-cgi/trace")
    .then(function (response) {
      return response.text();
    })
    .then(function (text) {
      var match = /loc=([A-Z]{2})/.exec(text);

      if (!match) {
        throw new Error("No country in response");
      }

      finish(match[1]);
    })
    .catch(function () {
      return fetch("https://api.country.is/")
        .then(function (response) {
          return response.json();
        })
        .then(function (data) {
          finish(data && data.country ? String(data.country) : null);
        });
    })
    .catch(function () {
      finish(null);
    });
}

function resolveCountry(callback) {
  var known = readStorage("localStorage", COUNTRY_STORAGE_KEY) || readStorage("sessionStorage", DETECTED_STORAGE_KEY);

  if (known) {
    callback(known);
    return;
  }

  if (!("fetch" in window)) {
    callback(guessFromTimeZone());
    return;
  }

  lookupCountryByIp(function (isoCountry) {
    if (!isoCountry) {
      callback(guessFromTimeZone());
      return;
    }

    var code = regionFor(isoCountry);
    writeStorage("sessionStorage", DETECTED_STORAGE_KEY, code);
    callback(code);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  var activeCountry = null;

  var applyCountry = function (code, remember) {
    var prices = PRICING[code];

    if (!prices || code === activeCountry) {
      return;
    }

    activeCountry = code;

    document.querySelectorAll("[data-price]").forEach(function (node) {
      node.textContent = prices[node.getAttribute("data-price")];
    });

    document.querySelectorAll("[data-country-select]").forEach(function (select) {
      select.value = code;
    });

    document.querySelectorAll('.contact-form [name="country"]').forEach(function (select) {
      var option = select.querySelector('option[data-code="' + code + '"]');

      if (option && select.value !== option.value) {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    if (remember) {
      writeStorage("localStorage", COUNTRY_STORAGE_KEY, code);
    }
  };

  document.querySelectorAll("[data-country-select]").forEach(function (select) {
    select.addEventListener("change", function () {
      applyCountry(select.value, true);
    });
  });

  document.querySelectorAll(".lang-option").forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (!window.location.hash) {
        return;
      }

      event.preventDefault();
      var url = new URL(link.getAttribute("href"), window.location.href);
      url.hash = window.location.hash;
      window.location.href = url.href;
    });
  });

  document.querySelectorAll(".contact-form").forEach(function (form) {
    var submitButton = form.querySelector('button[type="submit"]');
    var progressButton = form.querySelector("[data-progress-button]");
    var progressButtonLabel = form.querySelector("[data-progress-button-label]");

    // Few people in the United States use WhatsApp, so that country continues by text message.
    var usesSms = function () {
      var select = form.querySelector('[name="country"]');
      var option = select ? select.options[select.selectedIndex] : null;
      return Boolean(form.getAttribute("data-sms-number")) && Boolean(option) && option.getAttribute("data-code") === "US";
    };

    var getActiveRequiredFields = function () {
      return Array.from(form.querySelectorAll("input[required], select[required]")).filter(function (field) {
        return !field.disabled;
      });
    };

    var renderProgress = function () {
      var fields = getActiveRequiredFields();
      var completed = fields.filter(function (field) {
        return field.checkValidity() && String(field.value || "").trim() !== "";
      }).length;

      if (!progressButton) {
        return;
      }

      var lockedTemplate = progressButton.getAttribute("data-locked-template") || "{completed}/{total}";
      var readyLabel = (usesSms() && progressButton.form.getAttribute("data-sms-ready-label")) || progressButton.getAttribute("data-ready-label") || "Ready";
      progressButton.style.setProperty("--progress", String(fields.length ? (completed / fields.length) * 100 : 0) + "%");

      if (progressButtonLabel) {
        progressButtonLabel.textContent = completed === fields.length && fields.length > 0
          ? readyLabel
          : lockedTemplate.replace("{completed}", String(completed)).replace("{total}", String(fields.length));
      }
    };

    var syncSubmitState = function () {
      if (submitButton) {
        submitButton.disabled = !form.checkValidity();
      }

      renderProgress();
    };

    ["profession", "country"].forEach(function (fieldName) {
      var select = form.querySelector('[name="' + fieldName + '"]');
      var customField = form.querySelector('[data-custom-field="' + fieldName + '"]');
      var customInput = form.querySelector('[name="' + fieldName + '_other"]');

      if (!select || !customField || !customInput) {
        return;
      }

      var syncCustomField = function () {
        var useCustomValue = select.value === "other";
        customField.hidden = !useCustomValue;
        customInput.required = useCustomValue;
        customInput.disabled = !useCustomValue;

        if (!useCustomValue) {
          customInput.value = "";
        }

        syncSubmitState();
      };

      select.addEventListener("change", syncCustomField);
      syncCustomField();
    });

    var countrySelect = form.querySelector('[name="country"]');
    if (countrySelect) {
      countrySelect.addEventListener("change", function () {
        var option = countrySelect.options[countrySelect.selectedIndex];
        var code = option ? option.getAttribute("data-code") : null;

        if (code) {
          applyCountry(code, true);
        }
      });
    }

    form.querySelectorAll("input, select").forEach(function (field) {
      var updateFormState = function () {
        var status = form.querySelector(".form-status");
        if (status) {
          status.textContent = "";
        }
        syncSubmitState();
      };

      field.addEventListener("input", updateFormState);
      field.addEventListener("change", updateFormState);
    });

    syncSubmitState();

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var status = form.querySelector(".form-status");
      if (!form.reportValidity()) {
        return;
      }

      var formData = new FormData(form);
      var firstName = String(formData.get("first_name") || "").trim();
      var lastName = String(formData.get("last_name") || "").trim();
      var profession = String(formData.get("profession") || "").trim();
      var country = String(formData.get("country") || "").trim();

      if (profession === "other") {
        profession = String(formData.get("profession_other") || "").trim();
      }

      if (country === "other") {
        country = String(formData.get("country_other") || "").trim();
      }

      var emptyValue = form.getAttribute("data-empty-value") || "-";
      var business = String(formData.get("business") || "").trim();
      var website = String(formData.get("website") || "").trim() || emptyValue;
      var social = String(formData.get("social") || "").trim() || emptyValue;
      var template = (!PROMO_ACTIVE && form.getAttribute("data-message-template-regular")) || form.getAttribute("data-message-template") || "Hello, I want my free demo.";
      var message = template
        .replace("{firstName}", firstName)
        .replace("{lastName}", lastName)
        .replace("{profession}", profession)
        .replace("{country}", country)
        .replace("{business}", business)
        .replace("{website}", website)
        .replace("{social}", social);
      var sendBySms = usesSms();
      var whatsappBase = form.getAttribute("data-whatsapp-base") || "https://wa.me/18576055571";
      var whatsappUrl = whatsappBase + "?text=" + encodeURIComponent(message);

      if (status) {
        status.textContent = (sendBySms && form.getAttribute("data-sms-status-message")) || form.getAttribute("data-status-message") || "";
      }

      if (LEADS_ENDPOINT && navigator.sendBeacon) {
        navigator.sendBeacon(LEADS_ENDPOINT, JSON.stringify({
          firstName: firstName,
          lastName: lastName,
          business: business,
          profession: profession,
          country: country,
          website: website,
          social: social,
          language: document.documentElement.lang,
          promotion: PROMO_ACTIVE ? "halloween" : "none",
          method: sendBySms ? "sms" : "whatsapp"
        }));
      }

      if (typeof window.gtag === "function") {
        window.gtag("event", "generate_lead", { country: country, profession: profession, method: sendBySms ? "sms" : "whatsapp", promotion: PROMO_ACTIVE ? "halloween" : "none" });
      }

      if (sendBySms) {
        window.location.href = "sms:" + form.getAttribute("data-sms-number") + "?&body=" + encodeURIComponent(message);
        return;
      }

      window.open(whatsappUrl, "_blank", "noopener");
    });
  });

  resolveCountry(function (code) {
    applyCountry(code, false);
    document.documentElement.classList.remove("is-locating");
  });

  // The report in the hero counts up once, in step with its rows appearing.
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reducedMotion && "requestAnimationFrame" in window) {
    document.querySelectorAll("[data-count]").forEach(function (node) {
      var target = Number(node.getAttribute("data-count"));
      var delay = Number(node.getAttribute("data-count-delay") || 0);
      var duration = 700;

      node.textContent = "0";

      window.setTimeout(function () {
        var start = null;

        var step = function (timestamp) {
          if (start === null) {
            start = timestamp;
          }

          var progress = Math.min((timestamp - start) / duration, 1);
          node.textContent = String(Math.round(target * progress));

          if (progress < 1) {
            window.requestAnimationFrame(step);
          }
        };

        window.requestAnimationFrame(step);
      }, delay);
    });
  }

  document.querySelectorAll("[data-year]").forEach(function (node) {
    node.textContent = String(new Date().getFullYear());
  });
});

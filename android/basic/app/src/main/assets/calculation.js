// Derived from FULL calculateVEF; arithmetic and qualification comparisons retained verbatim.
// Only manual exclusion, reason validation, persistence and the row selector were removed/adapted.
function calculateVEF(showValidation = false) {

    const rows = document.querySelectorAll("#voyages .voyage");

    let totalShip = 0;
    let totalBL = 0;

    let validRows = [];
    let outside = [];
    const issues = [];

    rows.forEach((row, rowIndex) => {

        const shipInput = row.querySelector(".ship");
        const blInput = row.querySelector(".bl");
        const ship = shipInput.value.trim() === "" || shipInput.validity.badInput ? NaN : Number(shipInput.value);
        const bl = blInput.value.trim() === "" || blInput.validity.badInput ? NaN : Number(blInput.value);

        const differenceCell = row.querySelector(".difference");
        const vlrCell = row.querySelector(".vlr");
        const qualifiedCell = row.querySelector(".qualified");
        const statusCell = row.querySelector(".row-status");
        const errors = [];
        const warning = Number.isFinite(ship) && Number.isFinite(bl) && bl > 0 && Math.abs(ship - bl) / bl >= 0.05;

        [shipInput, blInput].forEach(input => input.classList.remove("invalid-input"));
        row.classList.remove("row-incomplete");

        if (shipInput.validity.stepMismatch) {
            errors.push("Ship Quantity must use no more than three decimal places");
            shipInput.classList.add("invalid-input");
        } else if (!Number.isFinite(ship) || ship <= 0) {
            errors.push(shipInput.validity.badInput || (shipInput.value.trim() !== "" && ship < 0) ? "Ship Quantity must be a valid positive number" : "Ship Quantity is required");
            shipInput.classList.add("invalid-input");
        }
        if (blInput.validity.stepMismatch) {
            errors.push("B/L Quantity must use no more than three decimal places");
            blInput.classList.add("invalid-input");
        } else if (!Number.isFinite(bl) || bl <= 0) {
            errors.push(blInput.validity.badInput || (blInput.value.trim() !== "" && bl < 0) ? "B/L Quantity must be a valid positive number" : "B/L Quantity is required and must be greater than zero");
            blInput.classList.add("invalid-input");
        }
        if (errors.length) {
            row.classList.add("row-incomplete");
            statusCell.textContent = "Incomplete: " + errors.join("; ");
            statusCell.className = "row-status";
            issues.push("Voyage " + (rowIndex + 1) + ": " + errors.join("; "));
        } else if (warning) {
            statusCell.textContent = "Warning: difference is at least 5% of B/L";
            statusCell.className = "row-status warning";
            issues.push("Voyage " + (rowIndex + 1) + ": Ship/B/L difference is at least 5%; check whether it is justified.");
        } else {
            statusCell.textContent = "Complete";
            statusCell.className = "row-status ready";
        }


        differenceCell.textContent = "-";
        vlrCell.textContent = "-";

        qualifiedCell.textContent = "-";
        qualifiedCell.className = "qualified";

        if (Number.isFinite(ship) && Number.isFinite(bl) && ship > 0 && bl > 0) {

            const difference = ship - bl;
            const vlr = ship / bl;

            differenceCell.textContent = difference.toFixed(3);
            vlrCell.textContent = vlr.toFixed(6);

            if (!errors.length) {
                totalShip += ship;
                totalBL += bl;

                validRows.push({
                    row: row,
                    vlr: vlr,
                    ship: ship,
                    bl: bl
                });
            }
        }
    });

    const imoInput = document.getElementById("imoNumber");
    const invalidIMO = !!imoInput.value.trim() && !/^\d+$/.test(imoInput.value.trim());
    imoInput.classList.toggle("invalid-input", invalidIMO);
    if (invalidIMO) issues.push("IMO Number must contain digits only.");


    document.getElementById("totalShip").textContent =
        totalShip.toFixed(3);

    document.getElementById("totalBL").textContent =
        totalBL.toFixed(3);

    const validation = document.getElementById("validationSummary");
    validation.className = "validation-summary";
    if (issues.length) {
        const hasError = invalidIMO || Array.from(rows).some(row => row.classList.contains("row-incomplete"));
        validation.classList.add(hasError ? "has-errors" : "has-warnings");
        validation.textContent = (hasError ? "Incomplete voyages are excluded from the calculation. " : "Review these warnings. ") + issues.join(" ");
    } else {
        validation.textContent = "";
    }


    if (validRows.length === 0 || totalBL === 0) {

        document.getElementById("averageRatio").textContent = "-";
        document.getElementById("lowerRange").textContent = "-";
        document.getElementById("upperRange").textContent = "-";
        document.getElementById("qualifiedCount").textContent = "0";
        outside.sort((a, b) => a - b);
        document.getElementById("outsideRange").textContent = outside.length ? outside.join(", ") : "None";
        document.getElementById("finalVEF").textContent = "-";

        if (showValidation && issues.length === 0) {
            validation.className = "validation-summary has-success";
            validation.textContent = "Calculation updated. All complete voyages were checked.";
        }



        return;
    }


    // Average Ratio = Total Ship's Figures / Total B/L Figures
    const averageRatio = totalShip / totalBL;

    const lowerRange = averageRatio - 0.003;
    const upperRange = averageRatio + 0.003;


    document.getElementById("averageRatio").textContent =
        averageRatio.toFixed(6);

    document.getElementById("lowerRange").textContent =
        lowerRange.toFixed(6);

    document.getElementById("upperRange").textContent =
        upperRange.toFixed(6);


    let qualifiedCount = 0;
    let qualifiedShip = 0;
    let qualifiedBL = 0;

    validRows.forEach((item) => {

        const qualified =
            item.vlr >= lowerRange &&
            item.vlr <= upperRange;

        const cell = item.row.querySelector(".qualified");

        if (qualified) {

            cell.textContent = "YES";
            cell.className = "qualified qualified-yes";

            qualifiedCount++;

            qualifiedShip += item.ship;
            qualifiedBL += item.bl;

        } else {

            cell.textContent = "NO";
            cell.className = "qualified qualified-no";

            outside.push(Array.prototype.indexOf.call(rows, item.row) + 1);
        }
    });


    outside.sort((a, b) => a - b);

    document.getElementById("qualifiedCount").textContent =
        qualifiedCount;


    if (outside.length > 0) {
        document.getElementById("outsideRange").textContent =
            outside.join(", ");
    } else {
        document.getElementById("outsideRange").textContent =
            "None";
    }

    if (showValidation && issues.length === 0) {
        validation.className = "validation-summary has-success";
        validation.textContent = "Calculation updated. All complete voyages were checked.";
    }


    // Final LOAD VEF
    if (qualifiedBL > 0) {

        const finalVEF = qualifiedShip / qualifiedBL;

        document.getElementById("finalVEF").textContent =
            finalVEF.toFixed(4);

    } else {

        document.getElementById("finalVEF").textContent =
            "-";
    }



}

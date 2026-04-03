import axios, { AxiosError } from "axios";
const DEVKIT_BASE_URL = process.env.DEVKIT_URL || "http://localhost:5199";
export async function devkitApi(endpoint, method = "POST", data) {
    try {
        const response = await axios({
            method,
            url: `${DEVKIT_BASE_URL}/api/${endpoint}`,
            data,
            timeout: 300000,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        });
        return response.data;
    }
    catch (error) {
        if (error instanceof AxiosError) {
            if (error.code === "ECONNREFUSED") {
                throw new Error(`DevKit is not running at ${DEVKIT_BASE_URL}. Start it with 'dotnet run' in your DevKit/src/DevKit directory.`);
            }
            if (error.response) {
                const msg = error.response.data?.error ||
                    error.response.data?.message ||
                    JSON.stringify(error.response.data);
                throw new Error(`DevKit API error (${error.response.status}): ${msg}`);
            }
        }
        throw error;
    }
}
export function formatResult(data) {
    if (typeof data === "string")
        return data;
    return JSON.stringify(data, null, 2);
}
//# sourceMappingURL=client.js.map
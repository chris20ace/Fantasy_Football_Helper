package dev.acebuilds.sundaydesk;

import org.json.JSONException;
import org.json.JSONObject;

final class BridgeResponse {
    static JSONObject success(String id, String command) {
        JSONObject result = new JSONObject();
        try { result.put("requestId", id).put("command", command).put("success", true); }
        catch (JSONException impossible) { throw new IllegalStateException("Cannot create bridge response"); }
        return result;
    }

    static JSONObject error(String id, String command, String code, String message) {
        JSONObject result = success(id, command);
        try { result.put("success", false).put("error", new JSONObject().put("code", code).put("message", message)); }
        catch (JSONException impossible) { throw new IllegalStateException("Cannot create bridge response"); }
        return result;
    }
}

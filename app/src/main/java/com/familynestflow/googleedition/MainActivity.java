package com.familynestflow.googleedition;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Locale;

public class MainActivity extends Activity {
    private static final String PREFS = "family_nestflow_google_edition";
    private static final String KEY_URL = "apps_script_exec_url";

    private SharedPreferences prefs;
    private EditText urlInput;
    private TextView statusText;
    private Button openButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        urlInput = findViewById(R.id.urlInput);
        statusText = findViewById(R.id.statusText);
        openButton = findViewById(R.id.openButton);
        Button saveOpenButton = findViewById(R.id.saveOpenButton);
        Button clearButton = findViewById(R.id.clearButton);

        String saved = prefs.getString(KEY_URL, "");
        if (saved != null && !saved.trim().isEmpty()) {
            urlInput.setText(saved.trim());
        }
        refreshState();

        saveOpenButton.setOnClickListener(v -> saveAndOpen());
        openButton.setOnClickListener(v -> openSavedUrl());
        clearButton.setOnClickListener(v -> clearSavedUrl());
    }

    private void saveAndOpen() {
        String value = urlInput.getText().toString().trim();
        String validation = validateAppsScriptExecUrl(value);
        if (validation != null) {
            urlInput.setError(validation);
            urlInput.requestFocus();
            return;
        }
        prefs.edit().putString(KEY_URL, value).apply();
        refreshState();
        openUrl(value);
    }

    private void openSavedUrl() {
        String value = prefs.getString(KEY_URL, "");
        if (value == null || value.trim().isEmpty()) {
            Toast.makeText(this, "Masukkan dan simpan URL Web App /exec terlebih dahulu.", Toast.LENGTH_LONG).show();
            urlInput.requestFocus();
            return;
        }
        String validation = validateAppsScriptExecUrl(value.trim());
        if (validation != null) {
            Toast.makeText(this, validation, Toast.LENGTH_LONG).show();
            return;
        }
        openUrl(value.trim());
    }

    private void clearSavedUrl() {
        prefs.edit().remove(KEY_URL).apply();
        urlInput.setText("");
        refreshState();
        Toast.makeText(this, "URL tersimpan dihapus.", Toast.LENGTH_SHORT).show();
    }

    private void refreshState() {
        String saved = prefs.getString(KEY_URL, "");
        boolean ready = saved != null && !saved.trim().isEmpty() && validateAppsScriptExecUrl(saved.trim()) == null;
        statusText.setText(ready
                ? "Siap digunakan • URL /exec tersimpan di perangkat ini."
                : "URL belum diatur. Deploy Google Apps Script terlebih dahulu lalu paste URL /exec.");
        openButton.setVisibility(ready ? View.VISIBLE : View.GONE);
    }

    private void openUrl(String value) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(value));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Browser tidak ditemukan pada perangkat ini.", Toast.LENGTH_LONG).show();
        }
    }

    private String validateAppsScriptExecUrl(String value) {
        if (value == null || value.trim().isEmpty()) return "URL belum diisi.";
        try {
            Uri uri = Uri.parse(value.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())) return "URL harus memakai HTTPS.";
            String host = uri.getHost();
            if (host == null) return "Host URL tidak valid.";
            host = host.toLowerCase(Locale.ROOT);
            if (!(host.equals("script.google.com") || host.endsWith(".script.google.com"))) {
                return "Gunakan URL deployment Google Apps Script dari script.google.com.";
            }
            String path = uri.getPath() == null ? "" : uri.getPath();
            if (!path.contains("/macros/s/") || !path.endsWith("/exec")) {
                return "Gunakan Web App URL deployment yang berakhiran /exec.";
            }
            return null;
        } catch (Exception e) {
            return "URL tidak valid.";
        }
    }
}

package com.familynestflow.googleedition;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String APP_URL =
            "https://wahyusetiyonyoto-jpg.github.io/Family-NestFlow-Google-Edition-Android/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        Button openButton = findViewById(R.id.openButton);
        openButton.setOnClickListener(v -> openSiRinci());
    }

    private void openSiRinci() {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(APP_URL));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Browser tidak ditemukan pada perangkat ini.", Toast.LENGTH_LONG).show();
        }
    }
}

package com.sirinci.app

import android.app.Activity
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var credentialManager: CredentialManager
    private lateinit var loginPanel: View
    private lateinit var statusText: TextView
    private lateinit var progress: ProgressBar
    private lateinit var loginButton: Button
    private lateinit var webView: WebView

    private val prefs by lazy {
        getSharedPreferences("sirinci_google_session", MODE_PRIVATE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        credentialManager = CredentialManager.create(this)
        loginPanel = findViewById(R.id.loginPanel)
        statusText = findViewById(R.id.statusText)
        progress = findViewById(R.id.loginProgress)
        loginButton = findViewById(R.id.googleLoginButton)
        webView = findViewById(R.id.financeWebView)

        configureWebView()
        loginButton.setOnClickListener { beginGoogleSignIn(false) }

        if (hasLocalSession()) {
            showFinanceApp()
        } else {
            showLoginState("Menyiapkan Login dengan Google...", busy = true, button = false)
            window.decorView.postDelayed({ beginGoogleSignIn(true) }, 350)
        }
    }

    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = false
        webView.settings.setSupportZoom(false)
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(AndroidBridge(), "SiRinciAndroid")
    }

    private fun hasLocalSession(): Boolean {
        return prefs.getString("email", null)?.isNotBlank() == true &&
            prefs.getString("google_unique_id", null)?.isNotBlank() == true
    }

    private fun beginGoogleSignIn(authorizedOnly: Boolean) {
        val clientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
        if (clientId.isBlank()) {
            showLoginState(
                "Google OAuth belum dikonfigurasi. Tambahkan repository variable GOOGLE_WEB_CLIENT_ID di GitHub lalu build ulang APK.",
                busy = false,
                button = true
            )
            return
        }

        showLoginState(
            if (authorizedOnly) "Memeriksa akun Google..." else "Pilih akun Google untuk masuk ke SiRinci.",
            busy = true,
            button = false
        )

        val googleOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(authorizedOnly)
            .setAutoSelectEnabled(authorizedOnly)
            .setServerClientId(clientId)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleOption)
            .build()

        scope.launch {
            try {
                val response = credentialManager.getCredential(
                    context = this@MainActivity,
                    request = request
                )
                val credential = response.credential
                if (credential is CustomCredential &&
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    val google = GoogleIdTokenCredential.createFrom(credential.data)
                    val email = google.email?.trim().orEmpty()
                    val uniqueId = google.uniqueId.trim()
                    val name = google.displayName?.trim()
                        ?.takeIf { it.isNotEmpty() }
                        ?: email.substringBefore("@").ifBlank { "Pengguna SiRinci" }

                    if (email.isBlank() || uniqueId.isBlank()) {
                        throw IllegalStateException("Google tidak mengembalikan profil Gmail yang valid.")
                    }

                    prefs.edit()
                        .putString("email", email)
                        .putString("name", name)
                        .putString("google_unique_id", uniqueId)
                        .putString("photo_url", google.profilePictureUri?.toString().orEmpty())
                        .apply()

                    showFinanceApp()
                } else {
                    showLoginState("Respons Google tidak dikenali. Silakan coba lagi.", false, true)
                }
            } catch (e: NoCredentialException) {
                if (authorizedOnly) {
                    beginGoogleSignIn(false)
                } else {
                    showLoginState(
                        "Tidak ada akun Google yang tersedia. Tambahkan akun Google di perangkat lalu coba lagi.",
                        false,
                        true
                    )
                }
            } catch (e: GetCredentialCancellationException) {
                showLoginState("Login dibatalkan. Tekan tombol di bawah untuk mencoba lagi.", false, true)
            } catch (e: GetCredentialException) {
                showLoginState(
                    "Login Google gagal: ${e.message ?: e.javaClass.simpleName}",
                    false,
                    true
                )
            } catch (e: Exception) {
                showLoginState(
                    "Tidak dapat masuk: ${e.message ?: "kesalahan tidak dikenal"}",
                    false,
                    true
                )
            }
        }
    }

    private fun showLoginState(message: String, busy: Boolean, button: Boolean) {
        loginPanel.visibility = View.VISIBLE
        webView.visibility = View.GONE
        statusText.text = message
        progress.visibility = if (busy) View.VISIBLE else View.GONE
        loginButton.visibility = if (button) View.VISIBLE else View.GONE
    }

    private fun showFinanceApp() {
        loginPanel.visibility = View.GONE
        webView.visibility = View.VISIBLE
        if (webView.url == null || webView.url == "about:blank") {
            webView.loadUrl("file:///android_asset/index.html")
        } else {
            webView.reload()
        }
    }

    private fun doLogout() {
        scope.launch {
            try {
                credentialManager.clearCredentialState(ClearCredentialStateRequest())
            } catch (_: Exception) {
                // Local sign-out still proceeds.
            }
            prefs.edit().clear().apply()
            webView.loadUrl("about:blank")
            showLoginState("Anda telah keluar. Pilih akun Google untuk masuk kembali.", false, true)
        }
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun getProfile(): String {
            val json = JSONObject()
            json.put("email", prefs.getString("email", "") ?: "")
            json.put("name", prefs.getString("name", "") ?: "")
            json.put("uniqueId", prefs.getString("google_unique_id", "") ?: "")
            json.put("photoUrl", prefs.getString("photo_url", "") ?: "")
            return json.toString()
        }

        @JavascriptInterface
        fun logout() {
            runOnUiThread { doLogout() }
        }

        @JavascriptInterface
        fun copyToClipboard(text: String) {
            runOnUiThread {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(
                    android.content.ClipData.newPlainText("SiRinci Backup", text)
                )
                Toast.makeText(
                    this@MainActivity,
                    "Backup disalin ke clipboard.",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

        @JavascriptInterface
        fun showToast(message: String) {
            runOnUiThread {
                Toast.makeText(
                    this@MainActivity,
                    message.take(180),
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.visibility == View.VISIBLE) {
            webView.evaluateJavascript(
                "window.SiRinciBack ? window.SiRinciBack() : false"
            ) { handled ->
                if (handled != "true") super.onBackPressed()
            }
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        scope.cancel()
        webView.removeJavascriptInterface("SiRinciAndroid")
        webView.destroy()
        super.onDestroy()
    }
}
